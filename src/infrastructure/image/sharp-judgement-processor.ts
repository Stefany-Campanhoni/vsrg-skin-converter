import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"
import { extractImageFrame } from "./extract-image-frame.ts"

export interface JudgementImageVariants {
  standardResolution: Buffer
  doubleResolution: Buffer
}

export async function renderJudgementImageVariants(
  definition: ImageAsset,
  sourceDensity: 1 | 2,
): Promise<JudgementImageVariants> {
  const extracted = await extractImageFrame(definition)
  const original = await sharp(extracted).ensureAlpha().png().toBuffer()
  const metadata = await sharp(original).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not render judgement ${definition.filePath}`)
  }

  const resize = (width: number, height: number) =>
    sharp(original)
      .resize({
        width,
        height,
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .ensureAlpha()
      .png()
      .toBuffer()

  if (sourceDensity === 1) {
    return {
      standardResolution: original,
      doubleResolution: await resize(metadata.width * 2, metadata.height * 2),
    }
  }

  const standardWidth = Math.round(metadata.width / 2)
  const standardHeight = Math.round(metadata.height / 2)
  if (standardWidth < 1 || standardHeight < 1) {
    throw new Error(`Judgement dimensions must remain positive: ${definition.filePath}`)
  }
  return {
    standardResolution: await resize(standardWidth, standardHeight),
    doubleResolution: original,
  }
}
