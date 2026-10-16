import { readdir } from "node:fs/promises"
import path from "node:path"
import { readTextFile } from "../../../infrastructure/filesystem/bun-file.ts"
import { createSkinFileResolver } from "./resolve-skin-files.ts"
import { createNoteSkinContext, type NoteSkinContext } from "./shared-note-skin-context.ts"

export type { NoteSkinContext } from "./shared-note-skin-context.ts"
export { normalizeRotation, titleByDirection } from "./shared-note-skin-context.ts"
export async function loadNoteSkinContext(skinDirectory: string): Promise<NoteSkinContext> {
  const filePath = await findNoteSkinFile(skinDirectory)
  const source = await readTextFile(filePath)
  return createNoteSkinContext(source, filePath, await createSkinFileResolver(skinDirectory))
}
async function findNoteSkinFile(skinDirectory: string): Promise<string> {
  const entries = await readdir(skinDirectory, { withFileTypes: true })
  const noteSkin = entries.find(
    (entry) => entry.isFile() && entry.name.toLowerCase() === "noteskin.lua",
  )
  if (!noteSkin) {
    throw new Error(`NoteSkin.lua was not found in ${skinDirectory}`)
  }
  return path.join(skinDirectory, noteSkin.name)
}
