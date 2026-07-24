import luaparse, { type Expression } from "luaparse"

export type LuaStringVariables = Readonly<Record<string, string>>

interface LuaStringLiteralLike {
  type?: unknown
  value?: unknown
  raw?: unknown
}

export function evaluateLuaString(
  expression: Expression,
  variables: LuaStringVariables,
): string | undefined {
  if (expression.type === "StringLiteral") {
    return readLuaStringLiteral(expression)
  }

  if (expression.type === "Identifier") {
    return variables[expression.name]
  }

  if (expression.type !== "BinaryExpression" || expression.operator !== "..") {
    return undefined
  }

  const left = evaluateLuaString(expression.left, variables)
  const right = evaluateLuaString(expression.right, variables)

  return left === undefined || right === undefined ? undefined : left + right
}

export function readLuaStringLiteral(value: LuaStringLiteralLike): string | undefined {
  if (value.type !== "StringLiteral") {
    return undefined
  }
  if (typeof value.value === "string") {
    return value.value
  }
  if (typeof value.raw !== "string") {
    return undefined
  }

  try {
    const ast = luaparse.parse(`return ${value.raw}`, {
      encodingMode: "pseudo-latin1",
      luaVersion: "5.3",
    })
    const statement = ast.body[0]
    const expression =
      ast.body.length === 1 &&
      statement?.type === "ReturnStatement" &&
      statement.arguments.length === 1
        ? statement.arguments[0]
        : undefined
    return expression?.type === "StringLiteral" && typeof expression.value === "string"
      ? expression.value
      : undefined
  } catch {
    return undefined
  }
}
