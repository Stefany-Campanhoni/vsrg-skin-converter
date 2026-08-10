import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { cp, rename, rm, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import packageJson from "../../package.json" with { type: "json" }
import { getReleasePaths } from "./release-config.ts"

export interface CommandInvocation {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
}

export interface RuntimeDependencyInstallationDependencies {
  readonly token: () => string
  readonly runCommand: (command: CommandInvocation) => Promise<void>
}

export interface InstallRuntimeDependenciesOptions {
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
  const sourcePackageDirectory = path.resolve(options.sourcePackageDirectory)
  const installationRoot = path.resolve(options.installationRoot)
  if (!path.isAbsolute(options.sourcePackageDirectory)) {
    throw new Error(
      `Expected an absolute runtime package source: ${options.sourcePackageDirectory}`,
    )
  }
  if (
    !path.isAbsolute(options.installationRoot) ||
    installationRoot === path.parse(installationRoot).root
  ) {
    throw new Error(`Unsafe runtime installation root: ${options.installationRoot}`)
  }
  await assertRegularFile(path.join(sourcePackageDirectory, "package.json"))
  await assertRegularFile(path.join(sourcePackageDirectory, "package-lock.json"))

  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const stagingRoot = `${installationRoot}.${dependencies.token()}.staging`
  const backupRoot = `${installationRoot}.${dependencies.token()}.backup`
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
    if (hadPrevious) await rename(installationRoot, backupRoot)
    try {
      await rename(stagingRoot, installationRoot)
    } catch (error) {
      if (hadPrevious) await rename(backupRoot, installationRoot)
      throw error
    }
    await rm(backupRoot, { recursive: true, force: true })
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
    await rm(backupRoot, { recursive: true, force: true })
  }
  return path.join(installationRoot, "node_modules")
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  console.log(
    await installRuntimeDependencies({
      sourcePackageDirectory: path.join(projectRoot, "scripts", "release", "runtime-package"),
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
