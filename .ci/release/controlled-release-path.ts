import type { Stats } from "node:fs"
import { lstat, realpath } from "node:fs/promises"
import path from "node:path"

function isOutsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export function resolveControlledRoot(controlledRoot: string): string {
  if (!path.isAbsolute(controlledRoot)) {
    throw new Error(`Expected an absolute controlled root: ${controlledRoot}`)
  }
  const resolvedRoot = path.resolve(controlledRoot)
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new Error(`Refusing to use a filesystem root as the controlled root: ${resolvedRoot}`)
  }
  return resolvedRoot
}

export function assertControlledReleasePath(
  controlledRoot: string,
  candidate: string,
  label: string,
): void {
  if (!path.isAbsolute(candidate)) {
    throw new Error(`Expected an absolute ${label}: ${candidate}`)
  }
  const resolvedRoot = resolveControlledRoot(controlledRoot)
  const resolvedCandidate = path.resolve(candidate)
  if (isOutsideRoot(resolvedRoot, resolvedCandidate)) {
    throw new Error(
      `${label} must be a strict descendant of controlled root ${resolvedRoot}: ${resolvedCandidate}`,
    )
  }
}

export async function assertPhysicallyControlledReleasePath(
  controlledRoot: string,
  candidate: string,
  label: string,
): Promise<void> {
  assertControlledReleasePath(controlledRoot, candidate, label)
  const resolvedRoot = resolveControlledRoot(controlledRoot)
  const resolvedCandidate = path.resolve(candidate)
  const rootDetails = await lstat(resolvedRoot)
  if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
    throw new Error(`Physical controlled root must be a real directory: ${resolvedRoot}`)
  }
  const physicalRoot = await realpath(resolvedRoot)
  let current = resolvedRoot
  for (const segment of path.relative(resolvedRoot, resolvedCandidate).split(path.sep)) {
    current = path.join(current, segment)
    let details: Stats
    try {
      details = await lstat(current)
    } catch (error) {
      if (isMissingPath(error)) break
      throw error
    }
    if (details.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link or junction: ${current}`)
    }
    const physicalCurrent = await realpath(current)
    if (isOutsideRoot(physicalRoot, physicalCurrent)) {
      throw new Error(
        `${label} resolves outside physical controlled root ${physicalRoot}: ${current}`,
      )
    }
    if (details.isFile() && details.nlink !== 1) {
      throw new Error(`${label} contains a multiply-linked file: ${current}`)
    }
  }
}

export function assertSafeTransactionToken(token: string): void {
  if (!/^[0-9A-Za-z-]+$/.test(token)) {
    throw new Error(`Unsafe release transaction token: ${token}`)
  }
}
