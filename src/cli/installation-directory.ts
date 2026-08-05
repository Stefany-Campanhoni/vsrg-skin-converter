import { stat } from "node:fs/promises"

export interface InstallationDirectoryDependencies {
  directoryExists(directory: string): Promise<boolean>
  waitForAnyKey(message: string): Promise<void>
  pickDirectory(): Promise<string | undefined>
}

export async function resolveInstallationDirectory(
  defaultDirectory: string | undefined,
  prompt: string,
  dependencies: InstallationDirectoryDependencies,
): Promise<string | undefined> {
  if (defaultDirectory && (await dependencies.directoryExists(defaultDirectory))) {
    return defaultDirectory
  }
  await dependencies.waitForAnyKey(prompt)
  const selectedDirectory = await dependencies.pickDirectory()
  if (!selectedDirectory) {
    return undefined
  }
  return (await dependencies.directoryExists(selectedDirectory)) ? selectedDirectory : undefined
}

export async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory()
  } catch (cause) {
    if (isMissingPathError(cause)) {
      return false
    }
    throw new Error(`Could not inspect installation directory ${directory}`, { cause })
  }
}

function isMissingPathError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false
  }
  return error.code === "ENOENT" || error.code === "ENOTDIR"
}
