import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"
import { extractImageFrame } from "./extract-image-frame.ts"
import { resizeImageProportionally } from "./resize-image.ts"

export interface JudgementImageVariants {
  standardResolution: Buffer
  doubleResolution: Buffer
}

export async function renderJudgementImageVariants(
  definition: ImageAsset,
  sourceDensity: 1 | 2,
  scale: number,
): Promise<JudgementImageVariants> {
  const extracted = await extractImageFrame(definition)
  const original = await sharp(extracted).ensureAlpha().png().toBuffer()
  const metadata = await sharp(original).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not render judgement ${definition.filePath}`)
  }

  return {
    standardResolution: await resizeImageProportionally(original, scale / sourceDensity),
    doubleResolution: await resizeImageProportionally(original, (scale * 2) / sourceDensity),
  }
}
