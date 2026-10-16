import {
  SourceFileNotFoundError,
  type SourceFiles,
} from "../../../application/ports/source-files.ts"
import type { ImageAsset } from "../../../domain/image.ts"
import { resolveSourcePath } from "../../../infrastructure/filesystem/resolve-source-path.ts"
import {
  OsuPngAssetNotFoundError,
  type ResolveOsuPngAssetOptions,
  selectOsuPngVariant,
} from "./osu-png-policy.ts"
export async function resolveOsuSourceAsset(
  source: SourceFiles,
  options: ResolveOsuPngAssetOptions,
): Promise<ImageAsset> {
  const variants = selectOsuPngVariant(options.logicalPath, options.useDoubleResolutionAssets)
  const choices = [
    variants.primary,
    ...(options.fallbackToStandardResolution && variants.fallback ? [variants.fallback] : []),
  ]
  let missing: unknown
  for (const variant of choices) {
    try {
      const relative = await resolveSourcePath(source, variant.segments.join("/"))
      return { filePath: source.assetId(relative), rotation: 0, pixelDensity: variant.pixelDensity }
    } catch (error) {
      if (!(error instanceof SourceFileNotFoundError)) throw error
      missing = error
    }
  }
  throw new OsuPngAssetNotFoundError(
    `Cannot resolve osu PNG asset '${options.logicalPath}': selected image was not found`,
    { cause: missing },
  )
}
