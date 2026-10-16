import type { SourceFiles } from "../../application/ports/source-files.ts"
import { sourceRelativePath } from "./source-relative-path.ts"
export function createScopedSourceFiles(
  access: Pick<SourceFiles, "list" | "readBytes">,
  nativeIdentity?: (path: string) => string,
): SourceFiles {
  const prefix = `asset:${crypto.randomUUID()}:`
  const identities = new Map<string, string>()
  return {
    list: async (directory) => {
      const entries = await access.list(sourceRelativePath(directory, true))
      const names = new Set<string>()
      for (const entry of entries) {
        const name = entry.name.toLowerCase()
        if (names.has(name)) throw new Error("Source paths are ambiguous ignoring case")
        names.add(name)
      }
      return entries
    },
    readBytes: async (path) => access.readBytes(sourceRelativePath(path)),
    assetId(path) {
      const relative = sourceRelativePath(path)
      const id = nativeIdentity?.(relative) ?? prefix + relative
      identities.set(id, relative)
      return id
    },
    ownsAsset: (id) => identities.has(id),
    async readAsset(id) {
      const relative = identities.get(id)
      if (!relative) throw new Error("Asset identity does not belong to this source")
      return access.readBytes(relative)
    },
  }
}
