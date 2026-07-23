import { readFileSync } from "node:fs"
import luaparse, { type Chunk } from "luaparse"

export function parseLuaFile(luaFile: string): Chunk {
  const source = readFileSync(luaFile, "utf-8")

  return luaparse.parse(source)
}
