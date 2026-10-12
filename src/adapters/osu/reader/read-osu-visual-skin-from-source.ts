import type { ImageOperations } from "../../../application/ports/image-operations.ts"
import type { SourceFiles } from "../../../application/ports/source-files.ts"
import type { VisualSkinModel } from "../../../domain/visual-skin.ts"
import { readSourceText } from "../../../infrastructure/filesystem/read-source-text.ts"
import { resolveSourcePath } from "../../../infrastructure/filesystem/resolve-source-path.ts"
import { resolveOsuSourceAsset } from "../assets/resolve-osu-source-asset.ts"
import { readOsuComboScaleUsing } from "../fonts/osu-combo-scale-policy.ts"
import { resolveOsuJudgementAssetUsing } from "../judgements/osu-judgement-policy.ts"
import { readOsuVisualSkinUsing } from "./osu-visual-skin-policy.ts"
export function readOsuVisualSkinFromSource(
  source: SourceFiles,
  images: ImageOperations,
  options: { name: string; useDoubleResolutionAssets: boolean },
): Promise<VisualSkinModel> {
  const resolveAsset = (resolution: Parameters<typeof resolveOsuSourceAsset>[1]) =>
    resolveOsuSourceAsset(source, resolution)
  return readOsuVisualSkinUsing(
    { game: "osu", name: options.name, sourcePath: options.name, gameRoot: "" },
    options.useDoubleResolutionAssets,
    {
      async readSkinIni() {
        const path = await resolveSourcePath(source, "skin.ini")
        return { filePath: path, source: await readSourceText(source, path) }
      },
      resolveAsset,
      resolveJudgementAsset: (resolution) =>
        resolveOsuJudgementAssetUsing(resolution, resolveAsset),
      readComboScale: (resolution) =>
        readOsuComboScaleUsing(resolution, {
          resolveOsuPngAsset: resolveAsset,
          readImageDimensions: async (id) => images.dimensions(await source.readAsset(id)),
        }),
    },
  )
}
