import type { ImageDensity } from "../../../domain/image.ts"
import {
  sourceExtname,
  sourceIsAbsolute,
} from "../../../infrastructure/filesystem/source-relative-path.ts"
export interface ResolveOsuPngAssetOptions {
  readonly skinDirectory: string
  readonly logicalPath: string
  readonly useDoubleResolutionAssets: boolean
  readonly fallbackToStandardResolution?: boolean
}

export class OsuPngAssetNotFoundError extends Error {}
interface OsuPngAssetVariant {
  readonly segments: string[]
  readonly pixelDensity: ImageDensity
}

export function selectOsuPngVariant(
  logicalPath: string,
  useDoubleResolutionAssets: boolean,
): { primary: OsuPngAssetVariant; fallback?: OsuPngAssetVariant } {
  validateOsuPngLogicalPath(logicalPath)
  const normalizedPath = logicalPath.replace(/\\/g, "/")

  const segments = normalizedPath.split("/")
  const fileName = segments.at(-1)
  if (!fileName) {
    throw new Error(`Cannot resolve osu PNG asset '${logicalPath}': path is empty`)
  }

  const extension = sourceExtname(fileName)
  const stem = extension ? fileName.slice(0, -extension.length) : fileName
  const explicitlyDouble = /@2x$/i.test(stem)
  const implicitlyDouble = !explicitlyDouble && useDoubleResolutionAssets
  const pixelDensity: ImageDensity = explicitlyDouble || implicitlyDouble ? "double" : "standard"
  const selectedName = `${stem}${implicitlyDouble ? "@2x" : ""}.png`
  const standardName = `${stem}.png`

  return {
    primary: { segments: [...segments.slice(0, -1), selectedName], pixelDensity },
    ...(implicitlyDouble
      ? {
          fallback: {
            segments: [...segments.slice(0, -1), standardName],
            pixelDensity: "standard" as const,
          },
        }
      : {}),
  }
}

export function validateOsuPngLogicalPath(logicalPath: string): void {
  const normalizedPath = logicalPath.replace(/\\/g, "/")
  if (sourceIsAbsolute(normalizedPath) || sourceIsAbsolute(logicalPath)) {
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

  const extension = sourceExtname(fileName)
  if (extension && extension.toLowerCase() !== ".png") {
    throw new Error(
      `Cannot resolve osu PNG asset '${logicalPath}': only PNG files are supported, not '${extension}'`,
    )
  }
}
