import { expect, onTestFinished, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseLuaFile } from "./parse-lua-file.ts"
import { parseLuaSource } from "./parse-lua-source.ts"

test("parses a Lua file into a chunk", () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "vsrg-lua-"))
  const luaFile = path.join(temporaryDirectory, "profile.lua")

  onTestFinished(() => rmSync(temporaryDirectory, { recursive: true }))
  writeFileSync(luaFile, "return {}", "utf-8")

  const ast = parseLuaFile(luaFile)

  expect(ast.type).toBe("Chunk")
  expect(ast.body[0]?.type).toBe("ReturnStatement")
})

test("file parsing has the same public AST behavior as source parsing", () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "vsrg-lua-"))
  const luaFile = path.join(temporaryDirectory, "profile.lua")
  const source = "return { value = 1 }"

  onTestFinished(() => rmSync(temporaryDirectory, { recursive: true }))
  writeFileSync(luaFile, source, "utf-8")

  expect(parseLuaFile(luaFile)).toStrictEqual(parseLuaSource(source))
})
