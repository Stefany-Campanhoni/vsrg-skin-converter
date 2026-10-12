import type { SourceEntry } from "../application/ports/source-files.ts"
import { SourceFileNotFoundError } from "../application/ports/source-files.ts"
import type { GameId } from "../domain/game.ts"
import { createScopedSourceFiles } from "../infrastructure/filesystem/scoped-source-files.ts"
export async function loadWebTemplates(game: GameId) {
  const root = new URL(`./templates/${game}/`, import.meta.url)
  const response = await fetch(new URL("manifest.json", root))
  if (!response.ok) throw new Error("Bundled template manifest is unavailable")
  const value: unknown = await response.json()
  if (!Array.isArray(value) || !value.every((path: unknown) => typeof path === "string"))
    throw new Error("Invalid bundled template manifest")
  const paths: readonly string[] = value
  return createScopedSourceFiles({
    async list(directory) {
      const prefix = directory ? `${directory}/` : "",
        entries = new Map<string, SourceEntry>()
      for (const path of paths) {
        if (!path.startsWith(prefix)) continue
        const tail = path.slice(prefix.length),
          slash = tail.indexOf("/"),
          name = slash < 0 ? tail : tail.slice(0, slash)
        entries.set(name, { name, kind: slash < 0 ? "file" : "directory" })
      }
      return [...entries.values()]
    },
    async readBytes(path) {
      if (!paths.includes(path)) throw new SourceFileNotFoundError("Bundled template was not found")
      const file = await fetch(new URL(path, root))
      if (!file.ok) throw new Error("Bundled template could not be loaded")
      return new Uint8Array(await file.arrayBuffer())
    },
  })
}
