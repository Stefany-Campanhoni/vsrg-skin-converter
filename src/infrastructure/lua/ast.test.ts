import assert from "node:assert/strict"
import test from "node:test"
import luaparse from "luaparse"
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
  assert.equal(getCallableName(asAstObject(texture)?.base), "GetPath")
  assert.ok(visited.includes("Chunk"))
  assert.ok(visited.includes("CallExpression"))
  assert.equal(asAstObject(null), undefined)
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
  assert.equal(statement?.type, "ReturnStatement")
  const root =
    statement?.type === "ReturnStatement" ? asAstObject(statement.arguments[0]) : undefined
  const judgement = getTableField(root, "judgment")

  assert.equal(asAstObject(getTableField(judgement, "fixture-guid"))?.raw, '"selected.png"')
  assert.equal(asAstObject(getTableField(judgement, "default"))?.raw, '"default.png"')
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

  assert.equal(asAstObject(getTableField(judgement, "fixture-guid"))?.raw, '"selected.png"')
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

  assert.equal(asAstObject(getTableField(judgement, "default"))?.raw, '"new-default.png"')
  assert.equal(asAstObject(getTableField(judgement, "fixture-guid"))?.raw, '"new-selected.png"')
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

  assert.equal(asAstObject(getTableFieldCaseInsensitive(root, "4k"))?.raw, '"new-value"')
  assert.equal(asAstObject(getTableField(root, ""))?.raw, '"empty-key-value"')
})
