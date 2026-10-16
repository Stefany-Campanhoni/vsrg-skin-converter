import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { SourceFileNotFoundError, type SourceFiles } from "../../application/ports/source-files.ts"
import { createScopedSourceFiles } from "./scoped-source-files.ts"

export function createNativeSourceFiles(root: string): SourceFiles {
  const absoluteRoot = path.resolve(root)
  async function contained(relative: string): Promise<string> {
    try {
      const [realRoot, target] = await Promise.all([
        realpath(absoluteRoot),
        realpath(path.resolve(absoluteRoot, relative)),
      ])
      const relation = path.relative(realRoot, target)
      if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation))
        throw new Error("Source path escapes its selected root")
      return target
    } catch (cause) {
      if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT")
        throw new SourceFileNotFoundError("Source file or directory was not found", { cause })
      throw cause
    }
  }
  return createScopedSourceFiles(
    {
      async list(relative) {
        const directory = await contained(relative)
        const entries = await readdir(directory, { withFileTypes: true })
        return Promise.all(
          entries.map(async (entry) => {
            const metadata = await stat(await contained(path.join(relative, entry.name)))
            if (!metadata.isFile() && !metadata.isDirectory())
              throw new Error("Unsupported source entry")
            return {
              name: entry.name,
              kind: metadata.isDirectory() ? ("directory" as const) : ("file" as const),
            }
          }),
        )
      },
      async readBytes(relative) {
        const filename = await contained(relative)
        if (!(await stat(filename)).isFile()) throw new Error("Source path is not a file")
        return new Uint8Array(await Bun.file(filename).arrayBuffer())
      },
    },
    (relative) => path.resolve(absoluteRoot, relative),
  )
}
