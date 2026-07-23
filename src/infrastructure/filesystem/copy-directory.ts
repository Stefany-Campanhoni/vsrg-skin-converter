import { cp, mkdir, readdir } from "node:fs/promises"
import path from "node:path"

export async function copyDirectory(
  sourceDirectory: string,
  targetDirectory: string,
): Promise<void> {
  await mkdir(targetDirectory, { recursive: true })
  const entries = await readdir(sourceDirectory)
  await Promise.all(
    entries.map((entry) =>
      cp(path.join(sourceDirectory, entry), path.join(targetDirectory, entry), {
        recursive: true,
        errorOnExist: true,
        force: false,
      }),
    ),
  )
}
