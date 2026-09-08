import { lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from "node:fs/promises"
import path from "node:path"

export interface NativeCacheAsset {
  readonly sourcePath: string
  readonly runtimeName: string
  readonly sha256: string
}

export interface NativeCacheOptions {
  readonly cacheParent: string
  readonly cacheName: string
  readonly assets: readonly NativeCacheAsset[]
}

export async function materializeNativeClosure(options: NativeCacheOptions): Promise<string> {
  assertSimpleName(options.cacheName, "cache directory")
  for (const asset of options.assets) assertSimpleName(asset.runtimeName, "native asset")

  await mkdir(options.cacheParent, { recursive: true })
  const resolvedParent = await realpath(options.cacheParent)
  const cacheRoot = path.join(resolvedParent, options.cacheName)
  assertStrictDescendant(resolvedParent, cacheRoot)

  if (await pathExists(cacheRoot)) {
    await verifyNativeClosure(cacheRoot, resolvedParent, options.assets)
    return cacheRoot
  }

  let stagingRoot: string | undefined
  try {
    stagingRoot = await mkdtemp(path.join(resolvedParent, `${options.cacheName}.staging-`))
    assertStrictDescendant(resolvedParent, await realpath(stagingRoot))
    for (const asset of options.assets) {
      const embedded = Bun.file(asset.sourcePath)
      if (!(await embedded.exists())) {
        throw new Error(`Embedded native asset is missing: ${asset.runtimeName}`)
      }
      const bytes = await embedded.bytes()
      if (sha256(bytes) !== asset.sha256) {
        throw new Error(`Embedded native asset checksum mismatch: ${asset.runtimeName}`)
      }
      const written = await Bun.write(path.join(stagingRoot, asset.runtimeName), bytes)
      if (written !== bytes.byteLength) {
        throw new Error(`Embedded native asset extraction was incomplete: ${asset.runtimeName}`)
      }
    }
    await verifyNativeClosure(stagingRoot, resolvedParent, options.assets)

    try {
      await rename(stagingRoot, cacheRoot)
      stagingRoot = undefined
    } catch (error: unknown) {
      if (!(await pathExists(cacheRoot))) throw error
    }
    await verifyNativeClosure(cacheRoot, resolvedParent, options.assets)
    return cacheRoot
  } finally {
    if (stagingRoot) {
      assertStrictDescendant(resolvedParent, stagingRoot)
      await rm(stagingRoot, { recursive: true, force: true })
    }
  }
}

async function verifyNativeClosure(
  cacheRoot: string,
  resolvedParent: string,
  assets: readonly NativeCacheAsset[],
): Promise<void> {
  const rootStats = await safeLstat(cacheRoot, "native cache directory")
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`Invalid native cache directory: ${cacheRoot}`)
  }
  const resolvedRoot = await realpath(cacheRoot)
  assertStrictDescendant(resolvedParent, resolvedRoot)

  const expectedNames = assets.map((asset) => asset.runtimeName).sort()
  const actualNames = (await readdir(resolvedRoot)).sort()
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, i) => name !== expectedNames[i])
  ) {
    throw new Error(`Invalid native cache closure: ${cacheRoot}`)
  }

  for (const asset of assets) {
    const targetPath = path.join(resolvedRoot, asset.runtimeName)
    const stats = await safeLstat(targetPath, `native cache asset ${asset.runtimeName}`)
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1) {
      throw new Error(`Invalid native cache asset: ${asset.runtimeName}`)
    }
    const actualSha256 = sha256(await Bun.file(targetPath).bytes())
    if (actualSha256 !== asset.sha256) {
      throw new Error(`Invalid native cache checksum: ${asset.runtimeName}`)
    }
  }
}

async function safeLstat(
  targetPath: string,
  label: string,
): Promise<Awaited<ReturnType<typeof lstat>>> {
  try {
    return await lstat(targetPath)
  } catch (error: unknown) {
    throw new Error(`Invalid ${label}: ${targetPath}`, { cause: error })
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath)
    return true
  } catch (error: unknown) {
    if (isErrorCode(error, "ENOENT")) return false
    throw error
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  )
}

function assertSimpleName(value: string, label: string): void {
  if (value === "" || value === "." || value === ".." || path.basename(value) !== value) {
    throw new Error(`Invalid ${label} name: ${value}`)
  }
}

function assertStrictDescendant(root: string, candidate: string): void {
  const relative = path.relative(root, candidate)
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Native cache path must stay inside its parent: ${candidate}`)
  }
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}
