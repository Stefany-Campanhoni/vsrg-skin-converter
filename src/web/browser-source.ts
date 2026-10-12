import { createDirectoryHandleSourceFiles } from "../infrastructure/filesystem/directory-handle-source-files.ts"
import { createFileListSourceFiles } from "../infrastructure/filesystem/file-list-source-files.ts"
import type { BrowserSource } from "./worker-messages.ts"
export function createBrowserSourceFiles(source: BrowserSource) {
  if (source.kind === "directory-handle") return createDirectoryHandleSourceFiles(source.handle)
  if (source.relativePaths && source.relativePaths.length !== source.files.length)
    throw new Error("Invalid folder file paths")
  return createFileListSourceFiles(
    source.files.map((file, index) => ({
      name: file.name,
      size: file.size,
      webkitRelativePath: source.relativePaths?.[index] ?? file.webkitRelativePath,
      arrayBuffer: () => file.arrayBuffer(),
    })),
  )
}
