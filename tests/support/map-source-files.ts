import type { SourceFiles } from "../../src/application/ports/source-files.ts"
import { createFileListSourceFiles } from "../../src/infrastructure/filesystem/file-list-source-files.ts"
export function createMapSourceFiles(files: ReadonlyMap<string, Uint8Array>): SourceFiles {
  return createFileListSourceFiles(
    [...files].map(([path, contents]) => ({
      name: path.split("/").at(-1) ?? path,
      webkitRelativePath: `Fixture/${path}`,
      size: contents.byteLength,
      async arrayBuffer() {
        return new Uint8Array(contents).buffer
      },
    })),
  )
}
