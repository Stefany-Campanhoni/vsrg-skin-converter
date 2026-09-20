import { expect, test } from "bun:test"
import luaparse from "luaparse"
import { expectTruthy } from "../../../tests/support/expectations.ts"
import {
  asAstObject,
  getCallableName,
  getMemberName,
  getTableField,
  getTableFieldCaseInsensitive,
  walkAst,
} from "./ast.ts"

test("provides shared Lua AST traversal and lookup primitives", () => {
  const ast = luaparse.parse(`
    local sprite = Def.Sprite {
      Texture=NOTESKIN:GetPath("_down", "Tap Note"),
    }
  `)
  const visited: string[] = []
  let sprite: ReturnType<typeof asAstObject>

  walkAst(ast, (node) => {
    if (node.type) {
      visited.push(node.type)
    }
    if (node.type === "TableCallExpression" && getMemberName(node.base) === "Sprite") {
      sprite = node
    }
  })

  const texture = getTableField(sprite, "Texture")
  expect(getCallableName(asAstObject(texture)?.base)).toBe("GetPath")
  expectTruthy(visited.includes("Chunk"))
  expectTruthy(visited.includes("CallExpression"))
  expect(asAstObject(null)).toBe(undefined)
})

test("reads identifier and bracketed-string fields from raw Lua tables", () => {
  const ast = luaparse.parse(`
    return {
      judgment = {
        ["fixture-guid"] = "selected.png",
        default = "default.png",
      },
    }
  `)
  const statement = ast.body[0]
  expect(statement?.type).toBe("ReturnStatement")
  const root =
    statement?.type === "ReturnStatement" ? asAstObject(statement.arguments[0]) : undefined
  const judgement = getTableField(root, "judgment")

  expect(asAstObject(getTableField(judgement, "fixture-guid"))?.raw).toBe('"selected.png"')
  expect(asAstObject(getTableField(judgement, "default"))?.raw).toBe('"default.png"')
})

test("decodes escaped bracketed-string keys before matching fields", () => {
  const ast = luaparse.parse(String.raw`
    return {
      judgment = {
        ["fixture\045guid"] = "selected.png",
      },
    }
  `)
  const statement = ast.body[0]
  const root =
    statement?.type === "ReturnStatement" ? asAstObject(statement.arguments[0]) : undefined
  const judgement = getTableField(root, "judgment")

  expect(asAstObject(getTableField(judgement, "fixture-guid"))?.raw).toBe('"selected.png"')
})

test("uses the last matching identifier and decoded bracketed-string fields", () => {
  const ast = luaparse.parse(String.raw`
    return {
      judgment = {
        default = "old-default.png",
        ["fixture\045guid"] = "old-selected.png",
        default = "new-default.png",
        ["fixture-guid"] = "new-selected.png",
      },
    }
  `)
  const statement = ast.body[0]
  const root =
    statement?.type === "ReturnStatement" ? asAstObject(statement.arguments[0]) : undefined
  const judgement = getTableField(root, "judgment")

  expect(asAstObject(getTableField(judgement, "default"))?.raw).toBe('"new-default.png"')
  expect(asAstObject(getTableField(judgement, "fixture-guid"))?.raw).toBe('"new-selected.png"')
})

test("matches table fields case-insensitively while preserving Lua last-write semantics", () => {
  const ast = luaparse.parse(`
    return {
      ["4k"] = "old-value",
      ["4K"] = "new-value",
      [""] = "empty-key-value",
    }
  `)
  const statement = ast.body[0]
  const root =
    statement?.type === "ReturnStatement" ? asAstObject(statement.arguments[0]) : undefined

  expect(asAstObject(getTableFieldCaseInsensitive(root, "4k"))?.raw).toBe('"new-value"')
  expect(asAstObject(getTableField(root, ""))?.raw).toBe('"empty-key-value"')
})
