import {
  type ReadableSourceFile,
  type SourceEntry,
  SourceFileNotFoundError,
  type SourceFiles,
} from "../../application/ports/source-files.ts"
import { createScopedSourceFiles } from "./scoped-source-files.ts"
import { sourceRelativePath } from "./source-relative-path.ts"
export function createFileListSourceFiles(files: readonly ReadableSourceFile[]): SourceFiles {
  const indexed = new Map<string, ReadableSourceFile>()
  const directories = new Map<string, Map<string, SourceEntry>>()
  const ambiguous = new Set<string>()
  let selectedRoot: string | undefined
  for (const file of files) {
    const path = sourceRelativePath(file.webkitRelativePath ?? "")
    const slash = path.indexOf("/")
    if (slash < 1) throw new Error("Directory files require a common selected root")
    const root = path.slice(0, slash)
    if (selectedRoot !== undefined && root !== selectedRoot)
      throw new Error("Directory files have different selected roots")
    selectedRoot = root
    const relative = path.slice(slash + 1)
    if (indexed.has(relative)) throw new Error("Duplicate source file path")
    indexed.set(relative, file)
    const segments = relative.split("/")
    let directory = ""
    for (const [index, name] of segments.entries()) {
      const entries = directories.get(directory) ?? new Map<string, SourceEntry>()
      directories.set(directory, entries)
      const kind = index === segments.length - 1 ? "file" : "directory"
      const prior = entries.get(name)
      if (prior && prior.kind !== kind) ambiguous.add(directory)
      entries.set(name, { name, kind })
      directory = directory ? `${directory}/${name}` : name
    }
  }
  return createScopedSourceFiles({
    async list(directory) {
      if (ambiguous.has(directory)) throw new Error("Ambiguous source file/directory path")
      const entries = directories.get(directory)
      if (directory && !entries) throw new SourceFileNotFoundError("Source directory was not found")
      return entries ? [...entries.values()] : []
    },
    async readBytes(path) {
      const file = indexed.get(path)
      if (!file) throw new SourceFileNotFoundError("Source file was not found")
      if (file.size > 32 * 1024 * 1024) throw new Error("Source file exceeds the 32 MiB limit")
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength > 32 * 1024 * 1024)
        throw new Error("Source file exceeds the 32 MiB limit")
      return bytes
    },
  })
}
