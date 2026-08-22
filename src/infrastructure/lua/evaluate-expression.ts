import type { Expression } from "luaparse"

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

  return decodeLuaStringLiteral(value.raw)
}

function decodeLuaStringLiteral(raw: string): string | undefined {
  return decodeLongString(raw) ?? decodeShortString(raw)
}

function decodeLongString(raw: string): string | undefined {
  const opening = /^\[(=*)\[/.exec(raw)
  if (!opening) {
    return undefined
  }
  const delimiter = opening[1] ?? ""
  const closing = `]${delimiter}]`
  if (!raw.endsWith(closing)) {
    return undefined
  }

  const contentStart = opening[0].length
  const contentEnd = raw.length - closing.length
  const content = raw.slice(contentStart, contentEnd)
  if (content.includes(closing)) {
    return undefined
  }

  return content.replace(/^(?:\r\n|\n\r|\r|\n)/, "").replace(/\r\n|\n\r|\r/g, "\n")
}

function decodeShortString(raw: string): string | undefined {
  const quote = raw[0]
  const end = raw.length - 1
  if ((quote !== '"' && quote !== "'") || raw[end] !== quote) {
    return undefined
  }

  const bytes: number[] = []
  let index = 1
  while (index < end) {
    const character = raw[index]
    if (character === "\r" || character === "\n" || character === quote) {
      return undefined
    }
    if (character !== "\\") {
      const nextIndex = appendUtf8CodePoint(bytes, raw, index)
      if (nextIndex === undefined) {
        return undefined
      }
      index = nextIndex
      continue
    }

    const decoded = decodeEscape(raw, index + 1, end)
    if (!decoded) {
      return undefined
    }
    bytes.push(...decoded.bytes)
    index = decoded.nextIndex
  }
  return decodeUtf8Bytes(bytes)
}

interface DecodedEscape {
  readonly bytes: readonly number[]
  readonly nextIndex: number
}

function decodeEscape(raw: string, index: number, end: number): DecodedEscape | undefined {
  const escaped = raw[index]
  const simpleEscapes: Readonly<Record<string, number>> = {
    a: 0x07,
    b: 0x08,
    f: 0x0c,
    n: 0x0a,
    r: 0x0d,
    t: 0x09,
    v: 0x0b,
    "\\": 0x5c,
    '"': 0x22,
    "'": 0x27,
  }
  const simple = escaped === undefined ? undefined : simpleEscapes[escaped]
  if (simple !== undefined) {
    return { bytes: [simple], nextIndex: index + 1 }
  }
  if (escaped === "\r" || escaped === "\n") {
    return { bytes: [0x0a], nextIndex: skipLineEnding(raw, index, end) }
  }
  if (escaped === "z") {
    return { bytes: [], nextIndex: skipWhitespace(raw, index + 1, end) }
  }
  if (escaped === "x") {
    return decodeHexadecimalByte(raw, index + 1, end)
  }
  if (escaped === "u") {
    return decodeUnicodeEscape(raw, index + 1, end)
  }
  if (escaped !== undefined && isDecimalDigit(escaped)) {
    return decodeDecimalByte(raw, index, end)
  }
  return undefined
}

function decodeHexadecimalByte(raw: string, index: number, end: number): DecodedEscape | undefined {
  const digits = raw.slice(index, index + 2)
  if (digits.length !== 2 || index + 2 > end || !/^[0-9a-fA-F]{2}$/.test(digits)) {
    return undefined
  }
  return { bytes: [Number.parseInt(digits, 16)], nextIndex: index + 2 }
}

function decodeUnicodeEscape(raw: string, index: number, end: number): DecodedEscape | undefined {
  if (raw[index] !== "{") {
    return undefined
  }
  const closing = raw.indexOf("}", index + 1)
  if (closing < 0 || closing >= end) {
    return undefined
  }
  const digits = raw.slice(index + 1, closing)
  if (!/^[0-9a-fA-F]+$/.test(digits)) {
    return undefined
  }
  const codePoint = Number.parseInt(digits, 16)
  if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return undefined
  }
  return {
    bytes: Array.from(new TextEncoder().encode(String.fromCodePoint(codePoint))),
    nextIndex: closing + 1,
  }
}

function decodeDecimalByte(raw: string, index: number, end: number): DecodedEscape | undefined {
  let nextIndex = index
  while (nextIndex < end && nextIndex - index < 3 && isDecimalDigit(raw[nextIndex] ?? "")) {
    nextIndex += 1
  }
  const value = Number.parseInt(raw.slice(index, nextIndex), 10)
  return value <= 255 ? { bytes: [value], nextIndex } : undefined
}

function appendUtf8CodePoint(bytes: number[], raw: string, index: number): number | undefined {
  const codePoint = raw.codePointAt(index)
  if (codePoint === undefined) {
    return undefined
  }
  const value = String.fromCodePoint(codePoint)
  bytes.push(...new TextEncoder().encode(value))
  return index + value.length
}

function decodeUtf8Bytes(bytes: readonly number[]): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    return undefined
  }
}

function skipLineEnding(raw: string, index: number, end: number): number {
  const first = raw[index]
  const second = raw[index + 1]
  return index + 1 < end && (first === "\r" ? second === "\n" : second === "\r")
    ? index + 2
    : index + 1
}

function skipWhitespace(raw: string, index: number, end: number): number {
  let nextIndex = index
  while (nextIndex < end && isLuaWhitespace(raw[nextIndex] ?? "")) {
    nextIndex += 1
  }
  return nextIndex
}

function isDecimalDigit(value: string): boolean {
  return value >= "0" && value <= "9"
}

function isLuaWhitespace(value: string): boolean {
  return (
    value === " " ||
    value === "\t" ||
    value === "\n" ||
    value === "\v" ||
    value === "\f" ||
    value === "\r"
  )
}
