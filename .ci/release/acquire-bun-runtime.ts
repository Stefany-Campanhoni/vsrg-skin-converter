import { access, lstat, mkdir, open, realpath, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import packageJson from "../../package.json" with { type: "json" }
import { hashFileSha256 } from "../runtime/hash-file.ts"
import { runCapturedSubprocess, runInheritedSubprocess } from "../runtime/run-subprocess.ts"
import {
  assertControlledReleasePath,
  assertPhysicallyControlledReleasePath,
  assertSafeTransactionToken,
  prepareControlledReleaseRoot,
  resolveControlledRoot,
} from "./controlled-release-path.ts"
import { acquireDirectoryPublicationLock } from "./directory-publication-lock.ts"
import { bunRuntime, getReleasePaths } from "./release-config.ts"

const verificationStampName = ".vsrg-runtime-verification.json"
const publicationLockPollIntervalMs = 50
const publicationLockTimeoutMs = 30_000
const stalePublicationLockAgeMs = 5 * 60_000

export interface BunRuntimeDependencies {
  readonly token: () => string
  readonly downloadFile: (url: string, destination: string) => Promise<void>
  readonly hashFile: (file: string) => Promise<string>
  readonly extractArchive: (archive: string, destination: string) => Promise<void>
  readonly readBunVersion: (bunExecutable: string) => Promise<string>
  readonly readBunRevision: (bunExecutable: string) => Promise<string>
  readonly renamePath: (source: string, destination: string) => Promise<void>
  readonly removePath: (
    target: string,
    options: { readonly recursive?: boolean; readonly force?: boolean },
  ) => Promise<void>
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

async function isOwnedRegularFile(root: string, file: string): Promise<boolean> {
  try {
    const details = await lstat(file)
    if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) return false
    const physicalRoot = await realpath(root)
    const physicalFile = await realpath(file)
    const relative = path.relative(physicalRoot, physicalFile)
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`)
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
  hashFile: hashFileSha256,
  extractArchive: defaultExtractArchive,
  readBunVersion,
  readBunRevision,
  renamePath: rename,
  removePath: rm,
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
  const stampPath = path.join(extractionRoot, verificationStampName)
  if (
    !(await isOwnedRegularFile(extractionRoot, bunExecutable)) ||
    !(await isOwnedRegularFile(extractionRoot, stampPath))
  ) {
    return false
  }
  try {
    const stamp = await Bun.file(stampPath).text()
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
  if (!(await isOwnedRegularFile(extractedRuntime, bunExecutable))) {
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
  await Promise.all([
    assertPhysicallyControlledReleasePath(controlledRoot, archivePath, "Bun runtime archive path"),
    assertPhysicallyControlledReleasePath(
      controlledRoot,
      extractionRoot,
      "Bun runtime extraction path",
    ),
  ])
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const token = dependencies.token()
  assertSafeTransactionToken(token)
  const temporaryArchive = `${archivePath}.${token}.tmp`
  const extractionContainer = `${extractionRoot}.${token}.extract`
  const staleExtractionRoot = `${extractionRoot}.${token}.stale`
  const publicationLock = `${extractionRoot}.publish.lock`
  assertControlledReleasePath(
    controlledRoot,
    temporaryArchive,
    "temporary Bun runtime archive path",
  )
  assertControlledReleasePath(controlledRoot, publicationLock, "Bun runtime publication lock path")
  assertControlledReleasePath(
    controlledRoot,
    extractionContainer,
    "temporary Bun runtime extraction path",
  )
  assertControlledReleasePath(
    controlledRoot,
    staleExtractionRoot,
    "stale Bun runtime extraction path",
  )
  await Promise.all([
    assertPhysicallyControlledReleasePath(
      controlledRoot,
      temporaryArchive,
      "temporary Bun runtime archive path",
    ),
    assertPhysicallyControlledReleasePath(
      controlledRoot,
      extractionContainer,
      "temporary Bun runtime extraction path",
    ),
    assertPhysicallyControlledReleasePath(
      controlledRoot,
      staleExtractionRoot,
      "stale Bun runtime extraction path",
    ),
    assertPhysicallyControlledReleasePath(
      controlledRoot,
      publicationLock,
      "Bun runtime publication lock path",
    ),
  ])
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
      await dependencies.removePath(archivePath, { force: true })
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
      try {
        await dependencies.renamePath(temporaryArchive, archivePath)
      } catch (publicationError) {
        try {
          const winningHash = (await dependencies.hashFile(archivePath)).toLowerCase()
          if (winningHash !== bunRuntime.sha256) throw publicationError
        } catch {
          throw publicationError
        }
      }
    } finally {
      await dependencies.removePath(temporaryArchive, { force: true })
    }
  }

  const bunExecutable = path.join(extractionRoot, "bun.exe")
  if (await isVerifiedExtraction(extractionRoot, dependencies)) return bunExecutable

  const extractedRuntime = path.join(extractionContainer, bunRuntime.archiveDirectoryName)
  await dependencies.removePath(extractionContainer, { recursive: true, force: true })
  try {
    await mkdir(extractionContainer, { recursive: true })
    await dependencies.extractArchive(archivePath, extractionContainer)
    await verifyFreshExtraction(extractedRuntime, dependencies)
    const releasePublicationLock = await acquireDirectoryPublicationLock({
      lockPath: publicationLock,
      pollIntervalMs: publicationLockPollIntervalMs,
      timeoutMs: publicationLockTimeoutMs,
      staleAfterMs: stalePublicationLockAgeMs,
    })
    try {
      if (await isVerifiedExtraction(extractionRoot, dependencies)) return bunExecutable

      let staleExtractionMoved = false
      try {
        await dependencies.renamePath(extractionRoot, staleExtractionRoot)
        staleExtractionMoved = true
      } catch {
        if (await isVerifiedExtraction(extractionRoot, dependencies)) return bunExecutable
      }
      try {
        await dependencies.renamePath(extractedRuntime, extractionRoot)
      } catch (publicationError) {
        if (!(await isVerifiedExtraction(extractionRoot, dependencies))) {
          if (staleExtractionMoved) {
            try {
              await dependencies.renamePath(staleExtractionRoot, extractionRoot)
              staleExtractionMoved = false
            } catch (restorationError) {
              throw new AggregateError(
                [publicationError, restorationError],
                "Bun runtime publication failed and the stale runtime could not be restored",
                { cause: publicationError },
              )
            }
          }
          throw publicationError
        }
      }
      if (staleExtractionMoved) {
        await dependencies.removePath(staleExtractionRoot, { recursive: true, force: true })
      }
    } finally {
      await releasePublicationLock()
    }
  } finally {
    await dependencies.removePath(extractionContainer, { recursive: true, force: true })
  }
  return bunExecutable
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(import.meta.dir, "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  await prepareControlledReleaseRoot(projectRoot, paths.cacheRoot, "Bun runtime cache root")
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
