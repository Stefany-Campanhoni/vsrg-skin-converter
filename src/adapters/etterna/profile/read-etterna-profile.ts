import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { Chunk } from "luaparse"
import luaparse from "luaparse"
import type { PlayfieldConfiguration } from "../../../domain/skin.ts"
import {
  type AstObject,
  asAstObject,
  getTableField,
  getTableFieldCaseInsensitive,
} from "../../../infrastructure/lua/ast.ts"
import { resolveEtternaProfileSettingsPath } from "../settings/etterna-settings-paths.ts"

const etternaJudgementZoomInfluence = 0.5

export async function readEtternaProfile(
  gameRoot: string,
  profileId: string,
  theme: string,
): Promise<Omit<PlayfieldConfiguration, "scrollSpeed" | "isDownscroll">> {
  const profileDirectory = resolveEtternaProfileSettingsPath(gameRoot, profileId, theme)
  const entries = await readProfileEntries(profileDirectory)
  const profilePath = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase() === "playerconfig.lua")
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((left, right) => left.localeCompare(right))
    .at(0)
  if (!profilePath) {
    throw new Error(`Etterna playerConfig.lua was not found in ${profileDirectory}`)
  }
  const source = await readProfileSource(profilePath)
  try {
    return extractEtternaPlayfieldConfiguration(luaparse.parse(source))
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : ""
    throw new Error(`Could not interpret Etterna profile ${profilePath}${detail}`, { cause })
  }
}

async function readProfileEntries(profileDirectory: string) {
  try {
    return await readdir(profileDirectory, {
      recursive: true,
      withFileTypes: true,
    })
  } catch (cause) {
    throw new Error(`Could not inspect Etterna profile settings ${profileDirectory}`, { cause })
  }
}

async function readProfileSource(profilePath: string): Promise<string> {
  try {
    return await readFile(profilePath, "utf8")
  } catch (cause) {
    throw new Error(`Could not read Etterna profile configuration ${profilePath}`, { cause })
  }
}

export function extractEtternaPlayfieldConfiguration(
  ast: Chunk,
): Omit<PlayfieldConfiguration, "scrollSpeed" | "isDownscroll"> {
  const returnStatement = ast.body.find((statement) => statement.type === "ReturnStatement")

  if (!returnStatement) {
    throw new Error("Lua file does not contain a return statement.")
  }

  const rootTable = requireTable(
    asAstObject(
      returnStatement.arguments.find((argument) => argument.type === "TableConstructorExpression"),
    ),
    "returned value",
  )

  const gameplayCoordinates = requireTable(
    getTableField(rootTable, "GameplayXYCoordinates"),
    "GameplayXYCoordinates",
  )

  const coordinates4k = requireTable(
    getTableFieldCaseInsensitive(gameplayCoordinates, "4K"),
    'GameplayXYCoordinates["4k"]',
  )

  const gameplaySizes = requireTable(getTableField(rootTable, "GameplaySizes"), "GameplaySizes")
  const sizes4k = requireTable(
    getTableFieldCaseInsensitive(gameplaySizes, "4K"),
    'GameplaySizes["4K"]',
  )
  const judgementZoom = readNumber(sizes4k, "JudgmentZoom")
  const comboZoom = readNumber(sizes4k, "ComboZoom")

  return {
    hitPosition: readNumber(coordinates4k, "NoteFieldY"),
    judgementPosition: readNumber(coordinates4k, "JudgmentY"),
    comboPosition: readNumber(coordinates4k, "ComboY"),
    columnWidth: readNumber(rootTable, "ReceptorSize"),
    judgementScale: 1 + (judgementZoom - 1) * etternaJudgementZoomInfluence,
    comboScale: comboZoom,
  }
}

function requireTable(expression: AstObject | undefined, path: string): AstObject {
  if (expression?.type !== "TableConstructorExpression") {
    throw new Error(`Expected ${path} to be a Lua table.`)
  }

  return expression
}

function readNumber(table: AstObject, key: string): number {
  const expression = getTableField(table, key)

  if (expression?.type === "NumericLiteral" && typeof expression.value === "number") {
    return expression.value
  }

  const argument = asAstObject(expression?.argument)
  if (
    expression?.type === "UnaryExpression" &&
    expression.operator === "-" &&
    argument?.type === "NumericLiteral" &&
    typeof argument.value === "number"
  ) {
    return -argument.value
  }

  throw new Error(`Expected "${key}" to be a numeric value.`)
}
