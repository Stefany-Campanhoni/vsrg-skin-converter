import { readFileSync } from "node:fs"
import luaparse, { type Chunk, type Statement, type TableConstructorExpression } from "luaparse"
import type { SkinPositions } from "../constants/game.ts"

export function getLuaAST(luaFile: string): Chunk {
  const source = readFileSync(luaFile, { encoding: "utf-8" })

  return luaparse.parse(source)
}

export function getGameplay4kCoordinates(ast: Statement[]): SkinPositions {
  const returnStatement = ast.find((statement) => statement.type === "ReturnStatement")

  const tableExpression = returnStatement?.arguments.find(
    (arg) => arg.type === "TableConstructorExpression",
  )

  const gameplayXYCoordinatesField = tableExpression?.fields.find(
    (field) => field.type === "TableKeyString" && field.key.name === "GameplayXYCoordinates",
  )?.value as TableConstructorExpression | undefined

  const coordinates4k = gameplayXYCoordinatesField?.fields.find(
    (field) =>
      field.type === "TableKey" &&
      field.key.type === "StringLiteral" &&
      field.key.raw.search(/4k/i) !== -1,
  )?.value as TableConstructorExpression | undefined

  if (!coordinates4k) {
    console.error("4k coordinates not found in the Lua AST.")
    process.exit(1)
  }

  const hitPosition = extractValueFromTable(coordinates4k, "NoteFieldY")
  const judgementPosition = extractValueFromTable(coordinates4k, "JudgmentY")
  const comboPosition = extractValueFromTable(coordinates4k, "ComboY")

  console.dir(coordinates4k, { depth: null })

  return {
    hitPosition,
    judgementPosition,
    comboPosition,
  }
}

function extractValueFromTable(table: TableConstructorExpression, keyName: string): number {
  const valueObject = table.fields.find(
    (field) => field.type === "TableKeyString" && field.key.name === keyName,
  )?.value

  if (valueObject?.type === "UnaryExpression") {
    if (valueObject.operator === "-") {
      return -1 * (valueObject.argument.type === "NumericLiteral" ? valueObject.argument.value : 0)
    }
    return valueObject.argument.type === "NumericLiteral" ? valueObject.argument.value : 0
  }

  return valueObject?.type === "NumericLiteral" ? valueObject.value : 0
}
