import path from "node:path"

export const bunRuntime = {
  version: "1.4.0",
  revision: "34cbb9a40",
  archiveName: "bun-windows-x64-baseline.zip",
  archiveDirectoryName: "bun-windows-x64-baseline",
  sha256: "b929c54a9badb104a16dedd23aab6152c86793ae653d4e6b13983ffd0c882a66",
  executableSha256: "627d2e4775c24bdedee2cd7ccc18dcadae061e5345274ab6e3c4c797927bfb8f",
  url: "https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-windows-x64-baseline.zip",
} as const

export interface ReleasePaths {
  readonly projectRoot: string
  readonly packageDirectoryName: string
  readonly buildRoot: string
  readonly cacheRoot: string
  readonly releaseRoot: string
  readonly bundlePath: string
  readonly bunArchivePath: string
  readonly bunRuntimeRoot: string
  readonly runtimeDependenciesRoot: string
  readonly windowsBuildRoot: string
  readonly unpackedPackageRoot: string
  readonly zipPath: string
  readonly checksumPath: string
}

function assertStrictDescendant(projectRoot: string, candidate: string): void {
  const relative = path.relative(projectRoot, candidate)
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Release path must be a strict descendant of ${projectRoot}: ${candidate}`)
  }
}

export function getReleasePaths(projectRoot: string, version: string): ReleasePaths {
  if (!path.isAbsolute(projectRoot))
    throw new Error(`Expected an absolute project root: ${projectRoot}`)
  const resolvedRoot = path.resolve(projectRoot)
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new Error(`Refusing to use a filesystem root: ${resolvedRoot}`)
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Expected a safe non-empty package version: ${JSON.stringify(version)}`)
  }

  const packageDirectoryName = `vsrg-skin-converter-v${version}-win-x64`
  const buildRoot = path.join(resolvedRoot, "build")
  const cacheRoot = path.join(resolvedRoot, ".cache", "release")
  const releaseRoot = path.join(resolvedRoot, "release")
  const bundlePath = path.join(buildRoot, "app.mjs")
  const bunArchivePath = path.join(cacheRoot, bunRuntime.archiveName)
  const bunRuntimeRoot = path.join(cacheRoot, `bun-v${bunRuntime.version}-windows-x64-baseline`)
  const runtimeDependenciesRoot = path.join(cacheRoot, "runtime-package-win-x64")
  const windowsBuildRoot = path.join(buildRoot, "windows-portable")
  const unpackedPackageRoot = path.join(windowsBuildRoot, packageDirectoryName)
  const zipPath = path.join(releaseRoot, `${packageDirectoryName}.zip`)
  const checksumPath = `${zipPath}.sha256`

  const paths = {
    projectRoot: resolvedRoot,
    packageDirectoryName,
    buildRoot,
    cacheRoot,
    releaseRoot,
    bundlePath,
    bunArchivePath,
    bunRuntimeRoot,
    runtimeDependenciesRoot,
    windowsBuildRoot,
    unpackedPackageRoot,
    zipPath,
    checksumPath,
  }
  for (const candidate of Object.values(paths).filter((value) => path.isAbsolute(value))) {
    if (candidate !== resolvedRoot) assertStrictDescendant(resolvedRoot, candidate)
  }
  return paths
}
