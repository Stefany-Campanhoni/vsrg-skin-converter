import assert from "node:assert/strict"
import test from "node:test"
import luaparse, { type Expression, type LocalStatement } from "luaparse"
import { evaluateLuaString } from "./evaluate-expression.ts"

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
