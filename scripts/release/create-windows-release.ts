import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import packageJson from "../../package.json" with { type: "json" }
import { getReleasePaths } from "./release-config.ts"
import { renameWithTransientRetry } from "./rename-with-transient-retry.ts"
import { verifyWindowsPortable } from "./verify-windows-portable.ts"

export interface ReleaseArtifact {
  readonly zipPath: string
  readonly checksumPath: string
  readonly sha256: string
}

export interface WindowsReleaseDependencies {
  readonly token: () => string
  readonly compress: (source: string, destination: string) => Promise<void>
  readonly extract: (archive: string, destination: string) => Promise<void>
  readonly hashFile: (file: string) => Promise<string>
  readonly verifyPackage: (packageRoot: string) => Promise<void>
  readonly renamePath: (source: string, destination: string) => Promise<void>
  readonly delay: (milliseconds: number) => Promise<void>
}

export interface CreateWindowsReleaseOptions {
  readonly packageRoot: string
  readonly packageDirectoryName: string
  readonly zipPath: string
  readonly checksumPath: string
  readonly sourceTemplatesRoot: string
  readonly expectedVersion: string
  readonly dependencies?: Partial<WindowsReleaseDependencies>
}

function runPowerShell(script: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script, ...args],
      { windowsHide: true, stdio: "inherit" },
    )
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(`PowerShell archive command exited with code ${code} and signal ${signal}`),
        )
    })
  })
}

async function compress(source: string, destination: string): Promise<void> {
  await runPowerShell(
    "& { param($source, $destination) Compress-Archive -LiteralPath $source -DestinationPath $destination -CompressionLevel Optimal -Force }",
    [source, destination],
  )
}

async function extract(archive: string, destination: string): Promise<void> {
  await runPowerShell(
    "& { param($archive, $destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }",
    [archive, destination],
  )
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256")
  await pipeline(createReadStream(file), hash)
  return hash.digest("hex")
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function assertReleasePaths(options: CreateWindowsReleaseOptions): void {
  const packageRoot = path.resolve(options.packageRoot)
  const zipPath = path.resolve(options.zipPath)
  const checksumPath = path.resolve(options.checksumPath)
  if (
    !path.isAbsolute(options.packageRoot) ||
    path.basename(packageRoot) !== options.packageDirectoryName
  ) {
    throw new Error(`Unsafe portable package path: ${options.packageRoot}`)
  }
  if (
    !path.isAbsolute(options.zipPath) ||
    path.basename(zipPath) !== `${options.packageDirectoryName}.zip` ||
    path.dirname(zipPath) === path.parse(zipPath).root
  ) {
    throw new Error(`Unsafe Windows release ZIP path: ${options.zipPath}`)
  }
  if (!path.isAbsolute(options.checksumPath) || checksumPath !== `${zipPath}.sha256`) {
    throw new Error(`Unsafe Windows release checksum path: ${options.checksumPath}`)
  }
  if (!path.isAbsolute(options.sourceTemplatesRoot)) {
    throw new Error(`Expected an absolute source templates root: ${options.sourceTemplatesRoot}`)
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

export async function createWindowsRelease(
  options: CreateWindowsReleaseOptions,
): Promise<ReleaseArtifact> {
  assertReleasePaths(options)
  const packageRoot = path.resolve(options.packageRoot)
  const zipPath = path.resolve(options.zipPath)
  const checksumPath = path.resolve(options.checksumPath)
  const sourceTemplatesRoot = path.resolve(options.sourceTemplatesRoot)
  const defaultDependencies: WindowsReleaseDependencies = {
    token: randomUUID,
    compress,
    extract,
    hashFile,
    renamePath: rename,
    delay,
    verifyPackage: async (root) =>
      verifyWindowsPortable({
        packageRoot: root,
        sourceTemplatesRoot,
        expectedVersion: options.expectedVersion,
      }),
  }
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const token = dependencies.token()
  if (!/^[0-9A-Za-z-]+$/.test(token)) throw new Error(`Unsafe release transaction token: ${token}`)

  const temporaryZip = path.join(
    path.dirname(zipPath),
    `.${path.basename(zipPath, ".zip")}.${token}.tmp.zip`,
  )
  const temporaryChecksum = `${temporaryZip}.sha256`
  const extractionRoot = path.join(path.dirname(zipPath), `.extract-${token}`)
  const extractedPackageRoot = path.join(extractionRoot, options.packageDirectoryName)
  const zipBackup = `${zipPath}.${token}.backup`
  const checksumBackup = `${checksumPath}.${token}.backup`
  await mkdir(path.dirname(zipPath), { recursive: true })
  for (const temporaryPath of [temporaryZip, temporaryChecksum, extractionRoot]) {
    await rm(temporaryPath, { recursive: true, force: true })
  }
  for (const backupPath of [zipBackup, checksumBackup]) {
    if (await pathExists(backupPath)) {
      throw new Error(`Refusing to overwrite a release recovery artifact: ${backupPath}`)
    }
  }

  try {
    await dependencies.verifyPackage(packageRoot)
    await dependencies.compress(packageRoot, temporaryZip)
    const sha256 = (await dependencies.hashFile(temporaryZip)).toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error(`Invalid SHA-256 digest for ${temporaryZip}: ${sha256}`)
    }
    await writeFile(temporaryChecksum, `${sha256}  ${path.basename(zipPath)}\n`, { flag: "wx" })
    const confirmedHash = (await dependencies.hashFile(temporaryZip)).toLowerCase()
    if (confirmedHash !== sha256) {
      throw new Error(`ZIP checksum changed before extraction: ${temporaryZip}`)
    }
    const checksumText = await readFile(temporaryChecksum, "utf8")
    if (checksumText !== `${sha256}  ${path.basename(zipPath)}\n`) {
      throw new Error(`Checksum file format mismatch: ${temporaryChecksum}`)
    }

    await mkdir(extractionRoot, { recursive: true })
    await dependencies.extract(temporaryZip, extractionRoot)
    if (!(await stat(extractedPackageRoot)).isDirectory()) {
      throw new Error(`ZIP is missing its versioned top-level directory: ${extractedPackageRoot}`)
    }
    await dependencies.verifyPackage(extractedPackageRoot)

    const hadZip = await pathExists(zipPath)
    const hadChecksum = await pathExists(checksumPath)
    if (hadZip !== hadChecksum) {
      throw new Error(`Refusing to replace an incomplete prior release pair: ${zipPath}`)
    }
    let zipBackedUp = false
    let checksumBackedUp = false
    let zipPublished = false
    let checksumPublished = false
    try {
      if (hadZip) {
        await renameWithTransientRetry(
          zipPath,
          zipBackup,
          dependencies.renamePath,
          dependencies.delay,
        )
        zipBackedUp = true
        await renameWithTransientRetry(
          checksumPath,
          checksumBackup,
          dependencies.renamePath,
          dependencies.delay,
        )
        checksumBackedUp = true
      }
      await renameWithTransientRetry(
        temporaryZip,
        zipPath,
        dependencies.renamePath,
        dependencies.delay,
      )
      zipPublished = true
      await renameWithTransientRetry(
        temporaryChecksum,
        checksumPath,
        dependencies.renamePath,
        dependencies.delay,
      )
      checksumPublished = true
    } catch (publicationError) {
      const rollbackErrors: unknown[] = []
      try {
        if (zipPublished) await rm(zipPath, { force: true })
        if (checksumPublished) await rm(checksumPath, { force: true })
      } catch (error) {
        rollbackErrors.push(error)
      }
      if (rollbackErrors.length === 0 && zipBackedUp) {
        try {
          await renameWithTransientRetry(
            zipBackup,
            zipPath,
            dependencies.renamePath,
            dependencies.delay,
          )
          zipBackedUp = false
        } catch (error) {
          rollbackErrors.push(error)
        }
      }
      if (rollbackErrors.length === 0 && checksumBackedUp) {
        try {
          await renameWithTransientRetry(
            checksumBackup,
            checksumPath,
            dependencies.renamePath,
            dependencies.delay,
          )
          checksumBackedUp = false
        } catch (error) {
          rollbackErrors.push(error)
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [publicationError, ...rollbackErrors],
          "Windows release publication failed and rollback was incomplete; recovery backups were retained",
          { cause: publicationError },
        )
      }
      throw publicationError
    }
    await rm(zipBackup, { force: true })
    await rm(checksumBackup, { force: true })
    return { zipPath, checksumPath, sha256 }
  } finally {
    await rm(temporaryZip, { force: true })
    await rm(temporaryChecksum, { force: true })
    await rm(extractionRoot, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  const artifact = await createWindowsRelease({
    packageRoot: paths.unpackedPackageRoot,
    packageDirectoryName: paths.packageDirectoryName,
    zipPath: paths.zipPath,
    checksumPath: paths.checksumPath,
    sourceTemplatesRoot: path.join(projectRoot, "src", "templates"),
    expectedVersion: packageJson.version,
  })
  console.log(`${artifact.zipPath}\n${artifact.checksumPath}\n${artifact.sha256}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
