import { zipSync } from "fflate"
import type { GeneratedFile } from "../../domain/generated-file.ts"
import { sourceRelativePath } from "../filesystem/source-relative-path.ts"
export async function createSkinArchive(files: readonly GeneratedFile[]): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = Object.create(null)
  const names = new Set<string>()
  for (const file of files) {
    const path = sourceRelativePath(file.relativePath),
      key = path.toLowerCase()
    if (names.has(key)) throw new Error("Duplicate or ambiguous archive path")
    names.add(key)
    entries[path] = file.contents
  }
  return zipSync(entries, { level: 0 })
}
