import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { Chunk, Expression, StringLiteral, TableConstructorExpression } from "luaparse"
import luaparse from "luaparse"
import type { PlayfieldConfiguration } from "../../../domain/skin.ts"

export async function readEtternaProfile(gameRoot: string): Promise<PlayfieldConfiguration> {
  const profileDirectory = path.join(
    gameRoot,
    "Save",
    "LocalProfiles",
    "00000000",
    "Rebirth_settings",
  )
  const entries = await readdir(profileDirectory, {
    recursive: true,
    withFileTypes: true,
  })
  const profile = entries.find((entry) => entry.isFile())
  if (!profile) {
    throw new Error(`Etterna profile file was not found in ${profileDirectory}`)
  }
  const profilePath = path.join(profile.parentPath, profile.name)
  const source = await readFile(profilePath, "utf8")
  return getGameplay4kCoordinates(luaparse.parse(source))
}

export function getGameplay4kCoordinates(ast: Chunk): PlayfieldConfiguration {
  const returnStatement = ast.body.find((statement) => statement.type === "ReturnStatement")

  if (!returnStatement) {
    throw new Error("Lua file does not contain a return statement.")
  }

  const rootTable = requireTable(
    returnStatement.arguments.find((argument) => argument.type === "TableConstructorExpression"),
    "returned value",
  )

  const gameplayCoordinates = requireTable(
    findNamedField(rootTable, "GameplayXYCoordinates"),
    "GameplayXYCoordinates",
  )

  const coordinates4k = requireTable(
    findStringKey(gameplayCoordinates, "4k"),
    'GameplayXYCoordinates["4k"]',
  )

  return {
    hitPosition: readNumber(coordinates4k, "NoteFieldY"),
    judgementPosition: readNumber(coordinates4k, "JudgmentY"),
    comboPosition: readNumber(coordinates4k, "ComboY"),
  }
}

function findNamedField(table: TableConstructorExpression, name: string): Expression | undefined {
  return table.fields.find((field) => field.type === "TableKeyString" && field.key.name === name)
    ?.value
}

function findStringKey(table: TableConstructorExpression, key: string): Expression | undefined {
  return table.fields.find(
    (field) =>
      field.type === "TableKey" &&
      field.key.type === "StringLiteral" &&
      getStringLiteralValue(field.key).toLowerCase() === key.toLowerCase(),
  )?.value
}

function getStringLiteralValue(literal: StringLiteral): string {
  return (literal.value as string | null) ?? literal.raw.slice(1, -1)
}

function requireTable(
  expression: Expression | undefined,
  path: string,
): TableConstructorExpression {
  if (expression?.type !== "TableConstructorExpression") {
    throw new Error(`Expected ${path} to be a Lua table.`)
  }

  return expression
}

function readNumber(table: TableConstructorExpression, key: string): number {
  const expression = findNamedField(table, key)

  if (expression?.type === "NumericLiteral") {
    return expression.value
  }

  if (
    expression?.type === "UnaryExpression" &&
    expression.operator === "-" &&
    expression.argument.type === "NumericLiteral"
  ) {
    return -expression.argument.value
  }

  throw new Error(`Expected "${key}" to be a numeric value.`)
}
