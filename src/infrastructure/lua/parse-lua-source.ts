import luaparse, { type Chunk } from "luaparse"

export interface ParseLuaSourceOptions {
  readonly ranges?: boolean
}

export function parseLuaSource(source: string, options: ParseLuaSourceOptions = {}): Chunk {
  return luaparse.parse(source, { ranges: options.ranges ?? false })
}
