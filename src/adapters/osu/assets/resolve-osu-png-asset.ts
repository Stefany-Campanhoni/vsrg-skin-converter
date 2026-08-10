import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset, ImageDensity } from "../../../domain/image.ts"

export interface ResolveOsuPngAssetOptions {
  readonly skinDirectory: string
  readonly logicalPath: string
  readonly useDoubleResolutionAssets: boolean
}

interface OsuAssetMetadata {
  isFile(): boolean
  isDirectory(): boolean
}

export interface ResolveOsuPngAssetDependencies {
  realpath(candidate: string): Promise<string>
  readdir(directory: string): Promise<string[]>
  stat(candidate: string): Promise<OsuAssetMetadata>
}

const defaultDependencies: ResolveOsuPngAssetDependencies = { realpath, readdir, stat }

export class OsuPngAssetNotFoundError extends Error {}

export async function resolveOsuPngAsset(
  options: ResolveOsuPngAssetOptions,
  dependencies: ResolveOsuPngAssetDependencies = defaultDependencies,
): Promise<ImageAsset> {
  const requestedPath = selectVariant(options.logicalPath, options.useDoubleResolutionAssets)
  const description = `osu PNG asset '${options.logicalPath}'`
  const skinRoot = await resolveSkinRoot(options.skinDirectory, description, dependencies.realpath)
  let currentDirectory = skinRoot

  for (const [index, segment] of requestedPath.segments.entries()) {
    const candidate = await resolveSegment(
      currentDirectory,
      segment,
      description,
      dependencies.readdir,
    )
    const target = await resolveRealPath(candidate, description, dependencies.realpath)

    if (!isWithin(skinRoot, target)) {
      throw new Error(`Cannot resolve ${description}: '${segment}' points outside the skin root`)
    }

    if (index === requestedPath.segments.length - 1) {
      const metadata = await readMetadata(target, description, dependencies.stat)
      if (!metadata.isFile()) {
        throw new Error(`Cannot resolve ${description}: selected path is not a regular file`)
      }

      return { filePath: candidate, rotation: 0, pixelDensity: requestedPath.pixelDensity }
    }

    const metadata = await readMetadata(target, description, dependencies.stat)
    if (!metadata.isDirectory()) {
      throw new Error(`Cannot resolve ${description}: path segment '${segment}' is not a directory`)
    }
    currentDirectory = target
  }

  throw new Error(`Cannot resolve ${description}: path is empty`)
}

function selectVariant(
  logicalPath: string,
  useDoubleResolutionAssets: boolean,
): { segments: string[]; pixelDensity: ImageDensity } {
  validateOsuPngLogicalPath(logicalPath)
  const normalizedPath = logicalPath.replace(/\\/g, "/")

  const segments = normalizedPath.split("/")
  const fileName = segments.at(-1)
  if (!fileName) {
    throw new Error(`Cannot resolve osu PNG asset '${logicalPath}': path is empty`)
  }

  const extension = path.posix.extname(fileName)
  const stem = extension ? fileName.slice(0, -extension.length) : fileName
  const explicitlyDouble = /@2x$/i.test(stem)
  const pixelDensity: ImageDensity =
    explicitlyDouble || useDoubleResolutionAssets ? "double" : "standard"
  const selectedName = `${stem}${!explicitlyDouble && useDoubleResolutionAssets ? "@2x" : ""}.png`

  return { segments: [...segments.slice(0, -1), selectedName], pixelDensity }
}

export function validateOsuPngLogicalPath(logicalPath: string): void {
  const normalizedPath = logicalPath.replace(/\\/g, "/")
  if (path.posix.isAbsolute(normalizedPath) || path.win32.isAbsolute(logicalPath)) {
    throw new Error(`Cannot resolve osu PNG asset '${logicalPath}': absolute paths are not allowed`)
  }

  const segments = normalizedPath.split("/")
  if (segments.length === 0 || segments.some((segment) => segment === "" || segment === ".")) {
    throw new Error(`Cannot resolve osu PNG asset '${logicalPath}': path is empty or malformed`)
  }
  if (segments.includes("..")) {
    throw new Error(`Cannot resolve osu PNG asset '${logicalPath}': traversal is not allowed`)
  }

  const fileName = segments.at(-1)
  if (!fileName) {
    throw new Error(`Cannot resolve osu PNG asset '${logicalPath}': path is empty`)
  }

  const extension = path.posix.extname(fileName)
  if (extension && extension.toLowerCase() !== ".png") {
    throw new Error(
      `Cannot resolve osu PNG asset '${logicalPath}': only PNG files are supported, not '${extension}'`,
    )
  }
}

async function resolveSkinRoot(
  skinDirectory: string,
  description: string,
  resolveRealPath: ResolveOsuPngAssetDependencies["realpath"],
): Promise<string> {
  try {
    return await resolveRealPath(path.resolve(skinDirectory))
  } catch (error) {
    throw new Error(
      `Cannot resolve ${description}: skin root is unavailable (${errorMessage(error)})`,
      { cause: error },
    )
  }
}

async function resolveSegment(
  directory: string,
  segment: string,
  description: string,
  readDirectory: ResolveOsuPngAssetDependencies["readdir"],
): Promise<string> {
  let entries: string[]
  try {
    entries = await readDirectory(directory)
  } catch (error) {
    throw new Error(
      `Cannot resolve ${description}: cannot read '${directory}' (${errorMessage(error)})`,
      { cause: error },
    )
  }

  const matches = entries.filter((entry) => entry.toLowerCase() === segment.toLowerCase())
  if (matches.length === 0) {
    throw new OsuPngAssetNotFoundError(`Cannot resolve ${description}: '${segment}' was not found`)
  }
  if (matches.length > 1) {
    throw new Error(`Cannot resolve ${description}: '${segment}' is ambiguous ignoring case`)
  }

  const match = matches.at(0)
  if (!match) {
    throw new OsuPngAssetNotFoundError(`Cannot resolve ${description}: '${segment}' was not found`)
  }
  return path.join(directory, match)
}

async function resolveRealPath(
  candidate: string,
  description: string,
  resolveCandidate: ResolveOsuPngAssetDependencies["realpath"],
): Promise<string> {
  try {
    return await resolveCandidate(candidate)
  } catch (error) {
    throw new Error(
      `Cannot resolve ${description}: cannot resolve '${candidate}' (${errorMessage(error)})`,
      { cause: error },
    )
  }
}

async function readMetadata(
  candidate: string,
  description: string,
  inspectCandidate: ResolveOsuPngAssetDependencies["stat"],
): Promise<OsuAssetMetadata> {
  try {
    return await inspectCandidate(candidate)
  } catch (error) {
    throw new Error(
      `Cannot resolve ${description}: cannot inspect '${candidate}' (${errorMessage(error)})`,
      { cause: error },
    )
  }
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
