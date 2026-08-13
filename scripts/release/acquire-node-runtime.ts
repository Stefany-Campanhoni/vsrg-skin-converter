import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import packageJson from "../../package.json" with { type: "json" }
import {
  assertControlledReleasePath,
  assertSafeTransactionToken,
  resolveControlledRoot,
} from "./controlled-release-path.ts"
import { getReleasePaths, nodeRuntime } from "./release-config.ts"

const verificationStampName = ".vsrg-runtime-verification.json"

export interface NodeRuntimeDependencies {
  readonly token: () => string
  readonly downloadFile: (url: string, destination: string) => Promise<void>
  readonly hashFile: (file: string) => Promise<string>
  readonly extractArchive: (archive: string, destination: string) => Promise<void>
  readonly readNodeVersion: (nodeExecutable: string) => Promise<string>
}

export interface AcquireNodeRuntimeOptions {
  readonly controlledRoot: string
  readonly archivePath: string
  readonly extractionRoot: string
  readonly dependencies?: Partial<NodeRuntimeDependencies>
}

function assertOwnedPaths(
  controlledRoot: string,
  archivePath: string,
  extractionRoot: string,
): void {
  for (const [candidate, label] of [
    [archivePath, "Node runtime archive path"],
    [extractionRoot, "Node runtime extraction path"],
  ] as const) {
    assertControlledReleasePath(controlledRoot, candidate, label)
  }
  if (!path.isAbsolute(archivePath) || path.basename(archivePath) !== nodeRuntime.archiveName) {
    throw new Error(`Unsafe Node runtime archive path: ${archivePath}`)
  }
  const expectedDirectory = `node-v${nodeRuntime.version}-win-x64`
  if (!path.isAbsolute(extractionRoot) || path.basename(extractionRoot) !== expectedDirectory) {
    throw new Error(`Unsafe Node runtime extraction path: ${extractionRoot}`)
  }
  if (path.dirname(archivePath) !== path.dirname(extractionRoot)) {
    throw new Error(`Node runtime cache paths must share one controlled parent: ${archivePath}`)
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
    throw new Error(`Node runtime download failed with HTTP ${response.status}: ${url}`)
  }
  await pipeline(
    Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
    createWriteStream(destination, { flags: "wx" }),
  )
}

async function defaultHashFile(file: string): Promise<string> {
  const hash = createHash("sha256")
  await pipeline(createReadStream(file), hash)
  return hash.digest("hex")
}

function readNodeVersion(nodeExecutable: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeExecutable, ["--version"], { windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8").trim())
      else
        reject(
          new Error(
            `${nodeExecutable} --version exited with code ${code} and signal ${signal}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
          ),
        )
    })
  })
}

function runProcess(executable: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", windowsHide: true })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${executable} exited with code ${code} and signal ${signal}`))
    })
  })
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

const defaultDependencies: NodeRuntimeDependencies = {
  token: randomUUID,
  downloadFile: defaultDownloadFile,
  hashFile: defaultHashFile,
  extractArchive: defaultExtractArchive,
  readNodeVersion,
}

function expectedVerificationStamp(): string {
  return `${JSON.stringify({
    archiveSha256: nodeRuntime.sha256,
    nodeExecutableSha256: nodeRuntime.executableSha256,
    nodeVersion: nodeRuntime.version,
  })}\n`
}

async function isVerifiedExtraction(
  extractionRoot: string,
  dependencies: NodeRuntimeDependencies,
): Promise<boolean> {
  const nodeExecutable = path.join(extractionRoot, "node.exe")
  if (!(await isRegularFile(nodeExecutable))) return false
  try {
    const stamp = await readFile(path.join(extractionRoot, verificationStampName), "utf8")
    if (stamp !== expectedVerificationStamp()) return false
    const executableHash = (await dependencies.hashFile(nodeExecutable)).toLowerCase()
    if (executableHash !== nodeRuntime.executableSha256) return false
    return (await dependencies.readNodeVersion(nodeExecutable)) === `v${nodeRuntime.version}`
  } catch {
    return false
  }
}

async function verifyFreshExtraction(
  extractedRuntime: string,
  dependencies: NodeRuntimeDependencies,
): Promise<void> {
  const nodeExecutable = path.join(extractedRuntime, "node.exe")
  if (!(await isRegularFile(nodeExecutable))) {
    throw new Error(`Extracted Node runtime is missing a regular file: ${nodeExecutable}`)
  }
  const executableHash = (await dependencies.hashFile(nodeExecutable)).toLowerCase()
  if (executableHash !== nodeRuntime.executableSha256) {
    throw new Error(
      `Extracted node.exe checksum mismatch for ${nodeExecutable}: expected ${nodeRuntime.executableSha256}, received ${executableHash}`,
    )
  }
  const version = await dependencies.readNodeVersion(nodeExecutable)
  if (version !== `v${nodeRuntime.version}`) {
    throw new Error(
      `Extracted Node runtime version mismatch for ${nodeExecutable}: expected v${nodeRuntime.version}, received ${version}`,
    )
  }
  await writeFile(path.join(extractedRuntime, verificationStampName), expectedVerificationStamp(), {
    flag: "wx",
  })
}

export async function acquireNodeRuntime(options: AcquireNodeRuntimeOptions): Promise<string> {
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
    "temporary Node runtime archive path",
  )
  assertControlledReleasePath(
    controlledRoot,
    extractionContainer,
    "temporary Node runtime extraction path",
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
    if (cachedHash !== nodeRuntime.sha256) {
      await rm(archivePath)
      throw new Error(
        `Node runtime checksum mismatch for ${archivePath}: expected ${nodeRuntime.sha256}, received ${cachedHash}`,
      )
    }
  } else {
    try {
      await dependencies.downloadFile(nodeRuntime.url, temporaryArchive)
      const downloadedHash = (await dependencies.hashFile(temporaryArchive)).toLowerCase()
      if (downloadedHash !== nodeRuntime.sha256) {
        throw new Error(
          `Node runtime checksum mismatch for ${temporaryArchive}: expected ${nodeRuntime.sha256}, received ${downloadedHash}`,
        )
      }
      await rename(temporaryArchive, archivePath)
    } finally {
      await rm(temporaryArchive, { force: true })
    }
  }

  const nodeExecutable = path.join(extractionRoot, "node.exe")
  if (await isVerifiedExtraction(extractionRoot, dependencies)) return nodeExecutable

  const extractedRuntime = path.join(extractionContainer, path.basename(extractionRoot))
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
  return nodeExecutable
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const paths = getReleasePaths(projectRoot, packageJson.version)
  console.log(
    await acquireNodeRuntime({
      controlledRoot: paths.cacheRoot,
      archivePath: paths.nodeArchivePath,
      extractionRoot: paths.nodeRuntimeRoot,
    }),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
