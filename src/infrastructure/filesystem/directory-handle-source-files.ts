import {
  type ReadableDirectoryHandle,
  SourceFileNotFoundError,
  type SourceFiles,
} from "../../application/ports/source-files.ts"
import { createScopedSourceFiles } from "./scoped-source-files.ts"
export function createDirectoryHandleSourceFiles(root: ReadableDirectoryHandle): SourceFiles {
  async function directory(path: string): Promise<ReadableDirectoryHandle> {
    let current = root
    for (const part of path.split("/").filter(Boolean))
      current = await current.getDirectoryHandle(part)
    return current
  }
  async function missing<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotFoundError")
        throw new SourceFileNotFoundError("Source file or directory was not found", { cause })
      throw cause
    }
  }
  return createScopedSourceFiles({
    async list(path) {
      return missing(async () => {
        const handle = await directory(path)
        const entries = []
        for await (const child of handle.values())
          entries.push({ name: child.name, kind: child.kind })
        return entries
      })
    },
    async readBytes(path) {
      return missing(async () => {
        const parts = path.split("/"),
          name = parts.pop()
        if (!name) throw new Error("Invalid source file path")
        const file = await (await (await directory(parts.join("/"))).getFileHandle(name)).getFile()
        if (file.size > 32 * 1024 * 1024) throw new Error("Source file exceeds the 32 MiB limit")
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (bytes.byteLength > 32 * 1024 * 1024)
          throw new Error("Source file exceeds the 32 MiB limit")
        return bytes
      })
    },
  })
}
