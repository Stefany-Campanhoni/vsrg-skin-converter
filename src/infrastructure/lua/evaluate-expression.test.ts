import { expect, test } from "bun:test"
import luaparse, { type Expression, type LocalStatement } from "luaparse"
import { expectTruthy } from "../../../tests/support/expectations.ts"
import { evaluateLuaString, readLuaStringLiteral } from "./evaluate-expression.ts"

function parseExpression(source: string): Expression {
  const chunk = luaparse.parse(`local value = ${source}`)
  const statement = chunk.body[0] as LocalStatement
  const expression = statement.init[0]

  expectTruthy(expression)
  return expression
}

test("evaluates string literals", () => {
  expect(evaluateLuaString(parseExpression('"Go Receptor"'), {})).toBe("Go Receptor")
})

test("decodes Lua 5.3 string literals while preserving Unicode", () => {
  const cases = [
    { raw: '"陽気 ⌈Lite⌋"', expected: "陽気 ⌈Lite⌋" },
    { raw: '"陽\\u{6c17}"', expected: "陽気" },
    { raw: String.raw`"\xE6\xB0\x97"`, expected: "気" },
    { raw: String.raw`"\230\176\151"`, expected: "気" },
    { raw: String.raw`"A\065\x42\n\t\\\""`, expected: 'AAB\n\t\\"' },
    { raw: "[=[\r\n陽気\rLite\n]=]", expected: "陽気\nLite\n" },
    { raw: '"left\\z \t\r\n right"', expected: "leftright" },
  ] as const

  for (const { raw, expected } of cases) {
    expect(readLuaStringLiteral({ type: "StringLiteral", value: null, raw })).toBe(expected)
  }
})

test("resolves controlled identifiers", () => {
  expect(evaluateLuaString(parseExpression("Button"), { Button: "Down" })).toBe("Down")
})

test("concatenates supported string expressions", () => {
  expect(
    evaluateLuaString(parseExpression('Button .. " " .. Element'), {
      Button: "Down",
      Element: "Receptor",
    }),
  ).toBe("Down Receptor")
})

test("does not evaluate calls or unknown identifiers", () => {
  expect(evaluateLuaString(parseExpression('os.execute("anything")'), {})).toBe(undefined)
  expect(evaluateLuaString(parseExpression("Unknown"), {})).toBe(undefined)
})
