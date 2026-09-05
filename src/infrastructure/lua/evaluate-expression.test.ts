import { test } from "bun:test"
import assert from "node:assert/strict"
import luaparse, { type Expression, type LocalStatement } from "luaparse"
import { evaluateLuaString, readLuaStringLiteral } from "./evaluate-expression.ts"

function parseExpression(source: string): Expression {
  const chunk = luaparse.parse(`local value = ${source}`)
  const statement = chunk.body[0] as LocalStatement
  const expression = statement.init[0]

  assert.ok(expression)
  return expression
}

test("evaluates string literals", () => {
  assert.equal(evaluateLuaString(parseExpression('"Go Receptor"'), {}), "Go Receptor")
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
    assert.equal(readLuaStringLiteral({ type: "StringLiteral", value: null, raw }), expected)
  }
})

test("resolves controlled identifiers", () => {
  assert.equal(evaluateLuaString(parseExpression("Button"), { Button: "Down" }), "Down")
})

test("concatenates supported string expressions", () => {
  assert.equal(
    evaluateLuaString(parseExpression('Button .. " " .. Element'), {
      Button: "Down",
      Element: "Receptor",
    }),
    "Down Receptor",
  )
})

test("does not evaluate calls or unknown identifiers", () => {
  assert.equal(evaluateLuaString(parseExpression('os.execute("anything")'), {}), undefined)
  assert.equal(evaluateLuaString(parseExpression("Unknown"), {}), undefined)
})
