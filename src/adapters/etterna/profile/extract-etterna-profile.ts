import type { Chunk } from "luaparse"
import type { PlayfieldConfiguration } from "../../../domain/skin.ts"
import {
  type AstObject,
  asAstObject,
  getTableField,
  getTableFieldCaseInsensitive,
} from "../../../infrastructure/lua/ast.ts"

const etternaJudgementZoomInfluence = 0.5
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
