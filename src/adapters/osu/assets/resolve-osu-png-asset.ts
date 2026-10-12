import {
  OsuPngAssetNotFoundError,
  type ResolveOsuPngAssetOptions,
  selectOsuPngVariant,
} from "./osu-png-policy.ts"

export type { ResolveOsuPngAssetOptions } from "./osu-png-policy.ts"
export { OsuPngAssetNotFoundError, validateOsuPngLogicalPath } from "./osu-png-policy.ts"

import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset, ImageDensity } from "../../../domain/image.ts"

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

export async function resolveOsuPngAsset(
  options: ResolveOsuPngAssetOptions,
  dependencies: ResolveOsuPngAssetDependencies = defaultDependencies,
): Promise<ImageAsset> {
  const requestedPath = selectOsuPngVariant(options.logicalPath, options.useDoubleResolutionAssets)
  const description = `osu PNG asset '${options.logicalPath}'`
  const skinRoot = await resolveSkinRoot(options.skinDirectory, description, dependencies.realpath)

  try {
    return await resolveVariant(requestedPath.primary, skinRoot, description, dependencies)
  } catch (error) {
    if (
      !options.fallbackToStandardResolution ||
      !requestedPath.fallback ||
      !(error instanceof OsuPngAssetNotFoundError)
    ) {
      throw error
    }
    return resolveVariant(requestedPath.fallback, skinRoot, description, dependencies)
  }
}

interface OsuPngAssetVariant {
  readonly segments: string[]
  readonly pixelDensity: ImageDensity
}

async function resolveVariant(
  variant: OsuPngAssetVariant,
  skinRoot: string,
  description: string,
  dependencies: ResolveOsuPngAssetDependencies,
): Promise<ImageAsset> {
  let currentDirectory = skinRoot

  for (const [index, segment] of variant.segments.entries()) {
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

    if (index === variant.segments.length - 1) {
      const metadata = await readMetadata(target, description, dependencies.stat)
      if (!metadata.isFile()) {
        throw new Error(`Cannot resolve ${description}: selected path is not a regular file`)
      }

      return { filePath: candidate, rotation: 0, pixelDensity: variant.pixelDensity }
    }

    const metadata = await readMetadata(target, description, dependencies.stat)
    if (!metadata.isDirectory()) {
      throw new Error(`Cannot resolve ${description}: path segment '${segment}' is not a directory`)
    }
    currentDirectory = target
  }

  throw new Error(`Cannot resolve ${description}: path is empty`)
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
