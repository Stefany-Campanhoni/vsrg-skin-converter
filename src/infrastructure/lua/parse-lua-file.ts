import { readFileSync } from "node:fs"
import type { Chunk } from "luaparse"
import { parseLuaSource } from "./parse-lua-source.ts"

export function parseLuaFile(luaFile: string): Chunk {
  const source = readFileSync(luaFile, "utf-8")

  return parseLuaSource(source)
}
