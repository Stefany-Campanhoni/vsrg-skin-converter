import path from "node:path"
import type { ImageAsset } from "../../../domain/image.ts"
import {
  OsuPngAssetNotFoundError,
  resolveOsuPngAsset,
  validateOsuPngLogicalPath,
} from "../assets/resolve-osu-png-asset.ts"

export interface ResolveOsuJudgementAssetOptions {
  readonly skinDirectory: string
  readonly logicalPath: string | undefined
  readonly defaultFileName: string
  readonly useDoubleResolutionAssets: boolean
}

export async function resolveOsuJudgementAsset(
  options: ResolveOsuJudgementAssetOptions,
): Promise<ImageAsset> {
  if (options.logicalPath) {
    validateOsuPngLogicalPath(options.logicalPath)
  }
  validateOsuPngLogicalPath(options.defaultFileName)
  const candidates = judgementCandidates(options.logicalPath, options.defaultFileName)
  let lastFailure: OsuPngAssetNotFoundError | undefined

  for (const logicalPath of candidates) {
    try {
      return await resolveOsuPngAsset({
        skinDirectory: options.skinDirectory,
        logicalPath,
        useDoubleResolutionAssets: options.useDoubleResolutionAssets,
      })
    } catch (error) {
      if (!(error instanceof OsuPngAssetNotFoundError)) {
        throw error
      }
      lastFailure = error
    }
  }

  throw new Error(
    `Cannot resolve osu judgement asset; tried ${candidates.map((candidate) => `'${candidate}'`).join(", ")}`,
    { cause: lastFailure },
  )
}

function judgementCandidates(logicalPath: string | undefined, defaultFileName: string): string[] {
  const candidates: string[] = []
  if (logicalPath) {
    candidates.push(withFrameZero(logicalPath), logicalPath)
    const directory = logicalPath.replace(/\\/g, "/")
    candidates.push(
      path.posix.join(directory, withFrameZero(defaultFileName)),
      path.posix.join(directory, defaultFileName),
    )
  } else {
    candidates.push(withFrameZero(defaultFileName), defaultFileName)
  }
  return [...new Set(candidates)]
}

function withFrameZero(logicalPath: string): string {
  const normalized = logicalPath.replace(/\\/g, "/")
  const extension = path.posix.extname(normalized)
  const stem = extension ? normalized.slice(0, -extension.length) : normalized
  if (/-0(?:@2x)?$/i.test(stem)) {
    return logicalPath
  }
  const densitySuffix = /@2x$/i.test(stem) ? stem.slice(-3) : ""
  const base = densitySuffix ? stem.slice(0, -densitySuffix.length) : stem
  return `${base}-0${densitySuffix}${extension}`
}
