import { lstat, mkdir, rename, rm } from "node:fs/promises"

interface DirectoryDetails {
  readonly mtimeMs: number
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

export interface DirectoryPublicationLockDependencies {
  readonly createDirectory: (directory: string) => Promise<void>
  readonly inspectPath: (target: string) => Promise<DirectoryDetails>
  readonly renamePath: (source: string, destination: string) => Promise<void>
  readonly removePath: (
    target: string,
    options: { readonly recursive?: boolean; readonly force?: boolean },
  ) => Promise<void>
  readonly delay: (milliseconds: number) => Promise<void>
  readonly now: () => number
}

export interface DirectoryPublicationLockOptions {
  readonly lockPath: string
  readonly staleLockPath: string
  readonly pollIntervalMs: number
  readonly timeoutMs: number
  readonly staleAfterMs: number
  readonly dependencies?: Partial<DirectoryPublicationLockDependencies>
}

const defaultDependencies: DirectoryPublicationLockDependencies = {
  createDirectory: async (directory) => mkdir(directory),
  inspectPath: lstat,
  renamePath: rename,
  removePath: rm,
  delay: async (milliseconds) => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  },
  now: Date.now,
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

export async function acquireDirectoryPublicationLock(
  options: DirectoryPublicationLockOptions,
): Promise<() => Promise<void>> {
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const startedAt = dependencies.now()
  while (true) {
    try {
      await dependencies.createDirectory(options.lockPath)
      return () => dependencies.removePath(options.lockPath, { recursive: true, force: true })
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error
    }

    let details: DirectoryDetails
    try {
      details = await dependencies.inspectPath(options.lockPath)
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) continue
      throw error
    }
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new Error(`Publication lock is not a real directory: ${options.lockPath}`)
    }
    const now = dependencies.now()
    if (now - details.mtimeMs >= options.staleAfterMs) {
      try {
        await dependencies.renamePath(options.lockPath, options.staleLockPath)
      } catch (error) {
        if (hasErrorCode(error, "ENOENT")) continue
        throw error
      }
      await dependencies.removePath(options.staleLockPath, { recursive: true, force: true })
      continue
    }
    if (now - startedAt >= options.timeoutMs) {
      throw new Error(`Timed out waiting for publication lock: ${options.lockPath}`)
    }
    await dependencies.delay(options.pollIntervalMs)
  }
}
