import { expect, test } from "bun:test"
import { asAstObject } from "./ast.ts"
import { parseLuaSource } from "./parse-lua-source.ts"

test("parses Lua source and optionally includes exact node ranges", () => {
  const source = "return { judgment = {} }"
  const ast = parseLuaSource(source, { ranges: true })
  const returned = ast.body[0]
  const table =
    returned?.type === "ReturnStatement" ? asAstObject(returned.arguments[0]) : undefined

  expect(table?.range).toStrictEqual([7, source.length])
})

test("preserves the original luaparse syntax error", () => {
  expect(() => parseLuaSource("return {")).toThrow(/'}' expected near '<eof>'/i)
})
