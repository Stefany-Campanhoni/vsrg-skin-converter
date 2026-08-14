import path from "node:path"

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
  const relative = path.relative(resolvedRoot, resolvedCandidate)
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `${label} must be a strict descendant of controlled root ${resolvedRoot}: ${resolvedCandidate}`,
    )
  }
}

export function assertSafeTransactionToken(token: string): void {
  if (!/^[0-9A-Za-z-]+$/.test(token)) {
    throw new Error(`Unsafe release transaction token: ${token}`)
  }
}
