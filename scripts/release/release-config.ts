import path from "node:path"

export const nodeRuntime = {
  version: "22.23.2",
  archiveName: "node-v22.23.2-win-x64.zip",
  sha256: "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97",
  url: "https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip",
} as const

export interface ReleasePaths {
  readonly projectRoot: string
  readonly packageDirectoryName: string
  readonly buildRoot: string
  readonly cacheRoot: string
  readonly releaseRoot: string
  readonly bundlePath: string
  readonly nodeArchivePath: string
  readonly nodeRuntimeRoot: string
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
  const nodeArchivePath = path.join(cacheRoot, nodeRuntime.archiveName)
  const nodeRuntimeRoot = path.join(cacheRoot, `node-v${nodeRuntime.version}-win-x64`)
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
    nodeArchivePath,
    nodeRuntimeRoot,
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
