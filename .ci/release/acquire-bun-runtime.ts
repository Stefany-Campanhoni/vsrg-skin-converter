import { access, mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import packageJson from "../../package.json" with { type: "json" }
import { runCapturedSubprocess, runInheritedSubprocess } from "../runtime/run-subprocess.ts"
import {
  assertControlledReleasePath,
  assertSafeTransactionToken,
  resolveControlledRoot,
} from "./controlled-release-path.ts"
import { bunRuntime, getReleasePaths } from "./release-config.ts"

const verificationStampName = ".vsrg-runtime-verification.json"

export interface BunRuntimeDependencies {
  readonly token: () => string
  readonly downloadFile: (url: string, destination: string) => Promise<void>
  readonly hashFile: (file: string) => Promise<string>
  readonly extractArchive: (archive: string, destination: string) => Promise<void>
  readonly readBunVersion: (bunExecutable: string) => Promise<string>
  readonly readBunRevision: (bunExecutable: string) => Promise<string>
}

export interface AcquireBunRuntimeOptions {
  readonly controlledRoot: string
  readonly archivePath: string
  readonly extractionRoot: string
  readonly dependencies?: Partial<BunRuntimeDependencies>
}

function assertOwnedPaths(
  controlledRoot: string,
  archivePath: string,
  extractionRoot: string,
): void {
  for (const [candidate, label] of [
    [archivePath, "Bun runtime archive path"],
    [extractionRoot, "Bun runtime extraction path"],
  ] as const) {
    assertControlledReleasePath(controlledRoot, candidate, label)
  }
  if (!path.isAbsolute(archivePath) || path.basename(archivePath) !== bunRuntime.archiveName) {
    throw new Error(`Unsafe Bun runtime archive path: ${archivePath}`)
  }
  const expectedDirectory = `bun-v${bunRuntime.version}-windows-x64-baseline`
  if (!path.isAbsolute(extractionRoot) || path.basename(extractionRoot) !== expectedDirectory) {
    throw new Error(`Unsafe Bun runtime extraction path: ${extractionRoot}`)
  }
  if (path.dirname(archivePath) !== path.dirname(extractionRoot)) {
    throw new Error(`Bun runtime cache paths must share one controlled parent: ${archivePath}`)
  }
}

async function isRegularFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

async function defaultDownloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Bun runtime download failed with HTTP ${response.status}: ${url}`)
  }
  const destinationHandle = await open(destination, "wx")
  try {
    await response.body.pipeTo(
      new WritableStream<Uint8Array>({
        async write(chunk) {
          let offset = 0
          while (offset < chunk.byteLength) {
            const { bytesWritten } = await destinationHandle.write(
              chunk,
              offset,
              chunk.byteLength - offset,
            )
            if (bytesWritten === 0) {
              throw new Error(`Bun runtime download made no write progress: ${destination}`)
            }
            offset += bytesWritten
          }
        },
      }),
    )
  } finally {
    await destinationHandle.close()
  }
}

async function defaultHashFile(file: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256")
  const reader = Bun.file(file).stream().getReader()
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      hash.update(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  return hash.digest("hex")
}

async function readBunVersion(bunExecutable: string): Promise<string> {
  const result = await runCapturedSubprocess([bunExecutable, "--version"])
  if (result.code !== 0) {
    throw new Error(
      `${bunExecutable} --version exited with code ${result.code} and signal ${result.signal}: ${result.stderr.trim()}`,
    )
  }
  return result.stdout.trim()
}

async function readBunRevision(bunExecutable: string): Promise<string> {
  const result = await runCapturedSubprocess([bunExecutable, "--revision"])
  if (result.code !== 0) {
    throw new Error(
      `${bunExecutable} --revision exited with code ${result.code} and signal ${result.signal}: ${result.stderr.trim()}`,
    )
  }
  return result.stdout.trim()
}

async function runProcess(executable: string, args: readonly string[]): Promise<void> {
  const result = await runInheritedSubprocess([executable, ...args])
  if (result.code !== 0) {
    throw new Error(`${executable} exited with code ${result.code} and signal ${result.signal}`)
  }
}

async function defaultExtractArchive(archive: string, destination: string): Promise<void> {
  await runProcess("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "& { param($archive, $destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }",
    archive,
    destination,
  ])
}

const defaultDependencies: BunRuntimeDependencies = {
  token: () => crypto.randomUUID(),
  downloadFile: defaultDownloadFile,
  hashFile: defaultHashFile,
  extractArchive: defaultExtractArchive,
  readBunVersion,
  readBunRevision,
}

function expectedVerificationStamp(): string {
  return `${JSON.stringify({
    archiveSha256: bunRuntime.sha256,
    bunExecutableSha256: bunRuntime.executableSha256,
    bunVersion: bunRuntime.version,
    bunRevision: bunRuntime.revision,
  })}\n`
}

async function isVerifiedExtraction(
  extractionRoot: string,
  dependencies: BunRuntimeDependencies,
): Promise<boolean> {
  const bunExecutable = path.join(extractionRoot, "bun.exe")
  if (!(await isRegularFile(bunExecutable))) return false
  try {
    const stamp = await Bun.file(path.join(extractionRoot, verificationStampName)).text()
    if (stamp !== expectedVerificationStamp()) return false
    const executableHash = (await dependencies.hashFile(bunExecutable)).toLowerCase()
    if (executableHash !== bunRuntime.executableSha256) return false
    const version = await dependencies.readBunVersion(bunExecutable)
    const revision = await dependencies.readBunRevision(bunExecutable)
    return (
      version === bunRuntime.version && revision === `${bunRuntime.version}+${bunRuntime.revision}`
    )
  } catch {
    return false
  }
}

async function verifyFreshExtraction(
  extractedRuntime: string,
  dependencies: BunRuntimeDependencies,
): Promise<void> {
  const bunExecutable = path.join(extractedRuntime, "bun.exe")
  if (!(await isRegularFile(bunExecutable))) {
    throw new Error(`Extracted Bun runtime is missing a regular file: ${bunExecutable}`)
  }
  const executableHash = (await dependencies.hashFile(bunExecutable)).toLowerCase()
  if (executableHash !== bunRuntime.executableSha256) {
    throw new Error(
      `Extracted bun.exe checksum mismatch for ${bunExecutable}: expected ${bunRuntime.executableSha256}, received ${executableHash}`,
    )
  }
  const version = await dependencies.readBunVersion(bunExecutable)
  if (version !== bunRuntime.version) {
    throw new Error(
      `Extracted Bun runtime version mismatch for ${bunExecutable}: expected ${bunRuntime.version}, received ${version}`,
    )
  }
  const revision = await dependencies.readBunRevision(bunExecutable)
  const expectedRevision = `${bunRuntime.version}+${bunRuntime.revision}`
  if (revision !== expectedRevision) {
    throw new Error(
      `Extracted Bun runtime revision mismatch for ${bunExecutable}: expected ${expectedRevision}, received ${revision}`,
    )
  }
  await writeFile(path.join(extractedRuntime, verificationStampName), expectedVerificationStamp(), {
    flag: "wx",
  })
}

export async function acquireBunRuntime(options: AcquireBunRuntimeOptions): Promise<string> {
  const controlledRoot = resolveControlledRoot(options.controlledRoot)
  const archivePath = path.resolve(options.archivePath)
  const extractionRoot = path.resolve(options.extractionRoot)
  assertOwnedPaths(controlledRoot, options.archivePath, options.extractionRoot)
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const token = dependencies.token()
  assertSafeTransactionToken(token)
  const temporaryArchive = `${archivePath}.${token}.tmp`
  const extractionContainer = `${extractionRoot}.${token}.extract`
  assertControlledReleasePath(
    controlledRoot,
    temporaryArchive,
    "temporary Bun runtime archive path",
  )
  assertControlledReleasePath(
    controlledRoot,
    extractionContainer,
    "temporary Bun runtime extraction path",
  )
  await mkdir(path.dirname(archivePath), { recursive: true })

  let archiveExists = true
  try {
    await access(archivePath)
  } catch {
    archiveExists = false
  }

  if (archiveExists) {
    const cachedHash = (await dependencies.hashFile(archivePath)).toLowerCase()
    if (cachedHash !== bunRuntime.sha256) {
      await rm(archivePath)
      throw new Error(
        `Bun runtime checksum mismatch for ${archivePath}: expected ${bunRuntime.sha256}, received ${cachedHash}`,
      )
    }
  } else {
    try {
      await dependencies.downloadFile(bunRuntime.url, temporaryArchive)
      const downloadedHash = (await dependencies.hashFile(temporaryArchive)).toLowerCase()
      if (downloadedHash !== bunRuntime.sha256) {
        throw new Error(
          `Bun runtime checksum mismatch for ${temporaryArchive}: expected ${bunRuntime.sha256}, received ${downloadedHash}`,
        )
      }
      await rename(temporaryArchive, archivePath)
    } finally {
      await rm(temporaryArchive, { force: true })
    }
  }

  const bunExecutable = path.join(extractionRoot, "bun.exe")
  if (await isVerifiedExtraction(extractionRoot, dependencies)) return bunExecutable

  const extractedRuntime = path.join(extractionContainer, bunRuntime.archiveDirectoryName)
  await rm(extractionContainer, { recursive: true, force: true })
  try {
    await mkdir(extractionContainer, { recursive: true })
    await dependencies.extractArchive(archivePath, extractionContainer)
    await verifyFreshExtraction(extractedRuntime, dependencies)
    await rm(extractionRoot, { recursive: true, force: true })
    await rename(extractedRuntime, extractionRoot)
  } finally {
    await rm(extractionContainer, { recursive: true, force: true })
  }
  return bunExecutable
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(import.meta.dir, "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  console.log(
    await acquireBunRuntime({
      controlledRoot: paths.cacheRoot,
      archivePath: paths.bunArchivePath,
      extractionRoot: paths.bunRuntimeRoot,
    }),
  )
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
