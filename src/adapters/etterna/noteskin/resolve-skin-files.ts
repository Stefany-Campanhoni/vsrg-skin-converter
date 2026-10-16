import { readdir } from "node:fs/promises"
import path from "node:path"
import { readTextFile } from "../../../infrastructure/filesystem/bun-file.ts"
import {
  createIndexedSkinFileResolver,
  type SkinFileResolver,
} from "./indexed-skin-file-resolver.ts"

export type { ResolvedSkinAsset, SkinFileResolver } from "./indexed-skin-file-resolver.ts"
export async function createSkinFileResolver(skinDirectory: string): Promise<SkinFileResolver> {
  const root = path.resolve(skinDirectory)
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return createIndexedSkinFileResolver(
    root,
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name)),
    readTextFile,
  )
}
