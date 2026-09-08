import path from "node:path"

export const standaloneTarget = "bun-windows-x64-baseline" as const
export const standaloneBunVersion = "1.4.0" as const
export const standaloneBunRevision = "34cbb9a40b4bd1bd767d134a7065e66c2432a676" as const
export const standaloneSharpVersion = "0.35.3" as const

export function assertStandaloneBunRuntime(version: string, revision: string): void {
  if (version !== standaloneBunVersion || revision !== standaloneBunRevision) {
    throw new Error(
      `Expected Bun ${standaloneBunVersion} revision ${standaloneBunRevision}, ` +
        `found Bun ${version} revision ${revision}`,
    )
  }
}

export interface StandaloneNativeAsset {
  readonly sourceName: string
  readonly embeddedName: string
  readonly runtimeName: string
  readonly sha256: string
}

export const standaloneNativeAssets: readonly StandaloneNativeAsset[] = [
  {
    sourceName: `sharp-win32-x64-${standaloneSharpVersion}.node`,
    embeddedName: `sharp-win32-x64-${standaloneSharpVersion}.bin`,
    runtimeName: `sharp-win32-x64-${standaloneSharpVersion}.node`,
    sha256: "45dbb968dff27a1e8d8870d2a34e6f5418fa2a1a4fe27a7ed13ab2fb3f895468",
  },
  {
    sourceName: "libvips-42.dll",
    embeddedName: "libvips-42.bin",
    runtimeName: "libvips-42.dll",
    sha256: "6d8ec83a826a1b46ef25a670501fd186475568dd3e48893cb4f756d0f2f428d8",
  },
  {
    sourceName: "libvips-cpp-8.18.3.dll",
    embeddedName: "libvips-cpp-8.18.3.bin",
    runtimeName: "libvips-cpp-8.18.3.dll",
    sha256: "d6eb3395e6f7799c9e2c997aba38068f1ab0684dc08a853013dbe528649306b9",
  },
] as const

export interface StandalonePaths {
  readonly projectRoot: string
  readonly buildRoot: string
  readonly smokeRoot: string
  readonly outputFile: string
}

export function getStandalonePaths(projectRoot: string, version: string): StandalonePaths {
  const resolvedRoot = path.resolve(projectRoot)
  if (path.dirname(resolvedRoot) === resolvedRoot) {
    throw new Error(`Standalone project root cannot be a filesystem root: ${resolvedRoot}`)
  }
  const buildRoot = path.join(resolvedRoot, "build", "standalone")
  const paths: StandalonePaths = {
    projectRoot: resolvedRoot,
    buildRoot,
    smokeRoot: path.join(buildRoot, "smoke workspace"),
    outputFile: path.join(buildRoot, `vsrg-skin-converter-v${version}-win-x64-experimental.exe`),
  }

  for (const candidate of Object.values(paths)) {
    if (candidate === resolvedRoot) continue
    assertStrictDescendant(resolvedRoot, candidate)
  }
  return paths
}

function assertStrictDescendant(root: string, candidate: string): void {
  const relative = path.relative(root, candidate)
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Standalone path must stay inside the project: ${candidate}`)
  }
}
