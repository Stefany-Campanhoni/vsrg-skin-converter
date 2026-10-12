import type { GeneratedFiles } from "../../application/ports/generated-files.ts"
import type { GeneratedFile } from "../../domain/generated-file.ts"
import { sourceRelativePath } from "../filesystem/source-relative-path.ts"
export function createGeneratedFileSet(
  maxBytes: number,
): GeneratedFiles & { snapshot(): readonly GeneratedFile[]; clear(): void } {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error("Output byte limit must be positive")
  const files = new Map<string, Uint8Array>()
  let total = 0
  return {
    async write(relativePath, contents) {
      const path = sourceRelativePath(relativePath)
      const key = path.toLowerCase()
      if (
        [...files.keys()].some(
          (prior) =>
            prior.toLowerCase().startsWith(`${key}/`) || key.startsWith(`${prior.toLowerCase()}/`),
        )
      )
        throw new Error("Output file/directory path conflict")
      if (
        [...files.keys()].some(
          (prior) => prior !== path && prior.toLowerCase() === path.toLowerCase(),
        )
      )
        throw new Error("Output path is ambiguous ignoring case")
      const next = total - (files.get(path)?.byteLength ?? 0) + contents.byteLength
      if (next > maxBytes) throw new Error("Converted output exceeds the byte limit")
      files.set(path, new Uint8Array(contents))
      total = next
    },
    async readBytes(path) {
      const bytes = files.get(sourceRelativePath(path))
      if (!bytes) throw new Error("Generated file was not found")
      return new Uint8Array(bytes)
    },
    async remove(path) {
      const relative = sourceRelativePath(path)
      total -= files.get(relative)?.byteLength ?? 0
      files.delete(relative)
    },
    snapshot() {
      return [...files]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([relativePath, contents]) => ({ relativePath, contents: new Uint8Array(contents) }))
    },
    clear() {
      files.clear()
      total = 0
    },
  }
}
