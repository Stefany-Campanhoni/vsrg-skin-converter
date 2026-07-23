import { cp, mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import { settleAll } from "../async/settle-all.ts"

type DirectoryEntryCopier = (sourcePath: string, targetPath: string) => Promise<void>

export interface CopyDirectoryOptions {
  copyEntry?: DirectoryEntryCopier
}

export async function copyDirectory(
  sourceDirectory: string,
  targetDirectory: string,
  options: CopyDirectoryOptions = {},
): Promise<void> {
  await mkdir(targetDirectory, { recursive: true })
  const entries = await readdir(sourceDirectory)
  const copyEntry: DirectoryEntryCopier =
    options.copyEntry ??
    ((sourcePath, targetPath) =>
      cp(sourcePath, targetPath, {
        recursive: true,
        errorOnExist: true,
        force: false,
      }))
  await settleAll(
    entries.map((entry) =>
      copyEntry(path.join(sourceDirectory, entry), path.join(targetDirectory, entry)),
    ),
  )
}
