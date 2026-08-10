import { randomUUID } from "node:crypto"
import type { Stats } from "node:fs"
import { cp, mkdir, rename, rm, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import packageJson from "../../package.json" with { type: "json" }
import { acquireNodeRuntime } from "./acquire-node-runtime.ts"
import { buildApplication } from "./build-application.ts"
import { installRuntimeDependencies } from "./install-runtime-dependencies.ts"
import { getReleasePaths } from "./release-config.ts"

export interface PortablePackage {
  readonly root: string
  readonly launcher: string
  readonly bundle: string
  readonly nodeExecutable: string
}

export interface AssembleWindowsPortableOptions {
  readonly packageRoot: string
  readonly bundlePath: string
  readonly nodeExecutablePath: string
  readonly runtimeNodeModulesPath: string
  readonly templatesRoot: string
  readonly launcherPath: string
  readonly readmePath: string
  readonly noticesPath: string
  readonly licensePath: string
  readonly dependencies?: { readonly token?: () => string }
}

async function assertRegularFile(file: string): Promise<void> {
  let details: Stats
  try {
    details = await stat(file)
  } catch (error) {
    throw new Error(`Required package source file is missing: ${file}`, { cause: error })
  }
  if (!details.isFile()) throw new Error(`Required package source is not a regular file: ${file}`)
}

async function assertDirectory(directory: string): Promise<void> {
  let details: Stats
  try {
    details = await stat(directory)
  } catch (error) {
    throw new Error(`Required package source directory is missing: ${directory}`, { cause: error })
  }
  if (!details.isDirectory())
    throw new Error(`Required package source is not a directory: ${directory}`)
}

function assertSafePackageRoot(packageRoot: string): void {
  if (!path.isAbsolute(packageRoot) || packageRoot === path.parse(packageRoot).root) {
    throw new Error(`Unsafe portable package root: ${packageRoot}`)
  }
  if (path.dirname(packageRoot) === path.parse(packageRoot).root) {
    throw new Error(
      `Portable package root must be nested below a controlled directory: ${packageRoot}`,
    )
  }
}

export async function assembleWindowsPortable(
  options: AssembleWindowsPortableOptions,
): Promise<PortablePackage> {
  const packageRoot = path.resolve(options.packageRoot)
  assertSafePackageRoot(packageRoot)
  const sources = {
    bundle: path.resolve(options.bundlePath),
    node: path.resolve(options.nodeExecutablePath),
    nodeModules: path.resolve(options.runtimeNodeModulesPath),
    templates: path.resolve(options.templatesRoot),
    launcher: path.resolve(options.launcherPath),
    readme: path.resolve(options.readmePath),
    notices: path.resolve(options.noticesPath),
    license: path.resolve(options.licensePath),
  }
  await Promise.all([
    assertRegularFile(sources.bundle),
    assertRegularFile(sources.node),
    assertRegularFile(sources.launcher),
    assertRegularFile(sources.readme),
    assertRegularFile(sources.notices),
    assertRegularFile(sources.license),
    assertDirectory(path.join(sources.nodeModules, "sharp")),
    assertDirectory(path.join(sources.nodeModules, "@img")),
    assertDirectory(path.join(sources.templates, "osu")),
    assertDirectory(path.join(sources.templates, "etterna")),
  ])

  const token = options.dependencies?.token?.() ?? randomUUID()
  const stagingRoot = `${packageRoot}.${token}.staging`
  const backupRoot = `${packageRoot}.${token}.backup`
  await mkdir(path.dirname(packageRoot), { recursive: true })
  await rm(stagingRoot, { recursive: true, force: true })
  try {
    await mkdir(path.join(stagingRoot, "runtime"), { recursive: true })
    await mkdir(path.join(stagingRoot, "node_modules"), { recursive: true })
    await mkdir(path.join(stagingRoot, "templates"), { recursive: true })
    await Promise.all([
      cp(sources.launcher, path.join(stagingRoot, "vsrg-skin-converter.cmd"), {
        errorOnExist: true,
        force: false,
      }),
      cp(sources.bundle, path.join(stagingRoot, "app.mjs"), { errorOnExist: true, force: false }),
      cp(sources.node, path.join(stagingRoot, "runtime", "node.exe"), {
        errorOnExist: true,
        force: false,
      }),
      cp(path.join(sources.nodeModules, "sharp"), path.join(stagingRoot, "node_modules", "sharp"), {
        recursive: true,
        errorOnExist: true,
        force: false,
      }),
      cp(path.join(sources.nodeModules, "@img"), path.join(stagingRoot, "node_modules", "@img"), {
        recursive: true,
        errorOnExist: true,
        force: false,
      }),
      cp(path.join(sources.templates, "osu"), path.join(stagingRoot, "templates", "osu"), {
        recursive: true,
        errorOnExist: true,
        force: false,
      }),
      cp(path.join(sources.templates, "etterna"), path.join(stagingRoot, "templates", "etterna"), {
        recursive: true,
        errorOnExist: true,
        force: false,
      }),
      cp(sources.readme, path.join(stagingRoot, "README.txt"), {
        errorOnExist: true,
        force: false,
      }),
      cp(sources.license, path.join(stagingRoot, "LICENSE"), {
        errorOnExist: true,
        force: false,
      }),
      cp(sources.notices, path.join(stagingRoot, "THIRD-PARTY-NOTICES.txt"), {
        errorOnExist: true,
        force: false,
      }),
    ])

    let hadPrevious = true
    try {
      await stat(packageRoot)
    } catch {
      hadPrevious = false
    }
    if (hadPrevious) await rename(packageRoot, backupRoot)
    try {
      await rename(stagingRoot, packageRoot)
    } catch (error) {
      if (hadPrevious) await rename(backupRoot, packageRoot)
      throw error
    }
    await rm(backupRoot, { recursive: true, force: true })
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
    await rm(backupRoot, { recursive: true, force: true })
  }

  return {
    root: packageRoot,
    launcher: path.join(packageRoot, "vsrg-skin-converter.cmd"),
    bundle: path.join(packageRoot, "app.mjs"),
    nodeExecutable: path.join(packageRoot, "runtime", "node.exe"),
  }
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  await buildApplication({
    entryPoint: path.join(projectRoot, "src", "cli.ts"),
    outputFile: paths.bundlePath,
  })
  const nodeExecutablePath = await acquireNodeRuntime({
    archivePath: paths.nodeArchivePath,
    extractionRoot: paths.nodeRuntimeRoot,
  })
  const runtimeNodeModulesPath = await installRuntimeDependencies({
    sourcePackageDirectory: path.join(projectRoot, "scripts", "release", "runtime-package"),
    installationRoot: paths.runtimeDependenciesRoot,
  })
  await assembleWindowsPortable({
    packageRoot: paths.unpackedPackageRoot,
    bundlePath: paths.bundlePath,
    nodeExecutablePath,
    runtimeNodeModulesPath,
    templatesRoot: path.join(projectRoot, "src", "templates"),
    launcherPath: path.join(projectRoot, "distribution", "vsrg-skin-converter.cmd"),
    readmePath: path.join(projectRoot, "distribution", "README.txt"),
    noticesPath: path.join(projectRoot, "distribution", "THIRD-PARTY-NOTICES.txt"),
    licensePath: path.join(projectRoot, "LICENSE"),
  })
  console.log(paths.unpackedPackageRoot)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
