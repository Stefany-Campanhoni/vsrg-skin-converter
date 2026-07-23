import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { parseLuaFile } from "./parse-lua-file.ts"

test("parses a Lua file into a chunk", (context) => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "vsrg-lua-"))
  const luaFile = path.join(temporaryDirectory, "profile.lua")

  context.after(() => rmSync(temporaryDirectory, { recursive: true }))
  writeFileSync(luaFile, "return {}", "utf-8")

  const ast = parseLuaFile(luaFile)

  assert.equal(ast.type, "Chunk")
  assert.equal(ast.body[0]?.type, "ReturnStatement")
})
