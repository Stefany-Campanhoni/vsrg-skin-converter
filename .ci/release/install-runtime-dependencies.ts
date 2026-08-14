import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { cp, rename, rm, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import packageJson from "../../package.json" with { type: "json" }
import {
  assertControlledReleasePath,
  assertSafeTransactionToken,
  resolveControlledRoot,
} from "./controlled-release-path.ts"
import { getReleasePaths } from "./release-config.ts"
import { renameWithTransientRetry } from "./rename-with-transient-retry.ts"

export interface CommandInvocation {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
}

export interface RuntimeDependencyInstallationDependencies {
  readonly token: () => string
  readonly runCommand: (command: CommandInvocation) => Promise<void>
  readonly renamePath: (source: string, destination: string) => Promise<void>
  readonly delay: (milliseconds: number) => Promise<void>
}

export interface InstallRuntimeDependenciesOptions {
  readonly controlledRoot: string
  readonly sourcePackageDirectory: string
  readonly installationRoot: string
  readonly dependencies?: Partial<RuntimeDependencyInstallationDependencies>
}

export function runRuntimeCommand(command: CommandInvocation): Promise<void> {
  return new Promise((resolve, reject) => {
    const executable =
      process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : command.executable
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", command.executable, ...command.args]
        : [...command.args]
    const child = spawn(executable, args, {
      cwd: command.cwd,
      stdio: "inherit",
      windowsHide: true,
    })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command.executable} exited with code ${code} and signal ${signal}`))
    })
  })
}

const defaultDependencies: RuntimeDependencyInstallationDependencies = {
  token: randomUUID,
  runCommand: runRuntimeCommand,
  renamePath: rename,
  delay: async (milliseconds) => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  },
}

async function assertRegularFile(file: string): Promise<void> {
  if (!(await stat(file)).isFile()) throw new Error(`Expected a regular file: ${file}`)
}

async function assertDirectory(directory: string): Promise<void> {
  if (!(await stat(directory)).isDirectory()) throw new Error(`Expected a directory: ${directory}`)
}

export async function installRuntimeDependencies(
  options: InstallRuntimeDependenciesOptions,
): Promise<string> {
  const controlledRoot = resolveControlledRoot(options.controlledRoot)
  const sourcePackageDirectory = path.resolve(options.sourcePackageDirectory)
  const installationRoot = path.resolve(options.installationRoot)
  if (!path.isAbsolute(options.sourcePackageDirectory)) {
    throw new Error(
      `Expected an absolute runtime package source: ${options.sourcePackageDirectory}`,
    )
  }
  assertControlledReleasePath(controlledRoot, options.installationRoot, "runtime installation root")
  await assertRegularFile(path.join(sourcePackageDirectory, "package.json"))
  await assertRegularFile(path.join(sourcePackageDirectory, "package-lock.json"))

  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const token = dependencies.token()
  assertSafeTransactionToken(token)
  const stagingRoot = `${installationRoot}.${token}.staging`
  const backupRoot = `${installationRoot}.${token}.backup`
  assertControlledReleasePath(controlledRoot, stagingRoot, "runtime installation staging root")
  assertControlledReleasePath(controlledRoot, backupRoot, "runtime installation backup root")
  let backupCreated = false
  let backupNeedsRecovery = false
  await rm(stagingRoot, { recursive: true, force: true })
  try {
    await cp(sourcePackageDirectory, stagingRoot, {
      recursive: true,
      errorOnExist: true,
      force: false,
    })
    const command = {
      executable: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["ci", "--omit=dev", "--os=win32", "--cpu=x64"],
      cwd: stagingRoot,
    } as const
    try {
      await dependencies.runCommand(command)
    } catch (error) {
      throw new Error(`Failed to install Windows x64 runtime dependencies in ${stagingRoot}`, {
        cause: error,
      })
    }
    await assertDirectory(path.join(stagingRoot, "node_modules", "sharp"))
    await assertDirectory(path.join(stagingRoot, "node_modules", "@img"))

    let hadPrevious = true
    try {
      await stat(installationRoot)
    } catch {
      hadPrevious = false
    }
    if (hadPrevious) {
      await renameWithTransientRetry(
        installationRoot,
        backupRoot,
        dependencies.renamePath,
        dependencies.delay,
      )
      backupCreated = true
    }
    try {
      await renameWithTransientRetry(
        stagingRoot,
        installationRoot,
        dependencies.renamePath,
        dependencies.delay,
      )
    } catch (promotionError) {
      if (backupCreated) {
        try {
          await renameWithTransientRetry(
            backupRoot,
            installationRoot,
            dependencies.renamePath,
            dependencies.delay,
          )
          backupCreated = false
        } catch (restorationError) {
          backupNeedsRecovery = true
          throw new AggregateError(
            [promotionError, restorationError],
            "Runtime dependency promotion failed and rollback was incomplete; the recovery backup was retained",
            { cause: promotionError },
          )
        }
      }
      throw promotionError
    }
    await rm(backupRoot, { recursive: true, force: true })
    backupCreated = false
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
    if (backupCreated && !backupNeedsRecovery) {
      await rm(backupRoot, { recursive: true, force: true })
    }
  }
  return path.join(installationRoot, "node_modules")
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  console.log(
    await installRuntimeDependencies({
      controlledRoot: paths.cacheRoot,
      sourcePackageDirectory: path.join(projectRoot, ".ci", "release", "runtime-package"),
      installationRoot: paths.runtimeDependenciesRoot,
    }),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
