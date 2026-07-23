import assert from "node:assert/strict"
import test from "node:test"
import luaparse from "luaparse"
import { asAstObject, getCallableName, getMemberName, getTableField, walkAst } from "./ast.ts"

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
