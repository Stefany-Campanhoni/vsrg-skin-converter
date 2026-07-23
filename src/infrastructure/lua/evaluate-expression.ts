import type { Expression } from "luaparse"

export type LuaStringVariables = Readonly<Record<string, string>>

export function evaluateLuaString(
  expression: Expression,
  variables: LuaStringVariables,
): string | undefined {
  if (expression.type === "StringLiteral") {
    const value: unknown = expression.value
    if (typeof value === "string") {
      return value
    }

    return decodeRawString(expression.raw)
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

function decodeRawString(raw: string): string | undefined {
  if (raw.startsWith("[[") && raw.endsWith("]]")) {
    return raw.slice(2, -2)
  }

  const quote = raw[0]
  if ((quote !== '"' && quote !== "'") || raw.at(-1) !== quote) {
    return undefined
  }

  return raw.slice(1, -1).replace(/\\([\\'"nrt])/g, (_, escaped: string) => {
    const replacements: Record<string, string> = {
      "\\": "\\",
      "'": "'",
      '"': '"',
      n: "\n",
      r: "\r",
      t: "\t",
    }
    return replacements[escaped] ?? escaped
  })
}
