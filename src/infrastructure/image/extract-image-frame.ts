import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"

export async function extractImageFrame(
  definition: Pick<ImageAsset, "filePath" | "frame">,
): Promise<string | Buffer> {
  const sourceMetadata = await sharp(definition.filePath).metadata()
  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error(`Could not read image dimensions from ${definition.filePath}`)
  }

  if (!definition.frame) {
    return definition.filePath
  }

  const { index, columns, rows } = definition.frame
  const frameCount = columns * rows
  if (
    columns < 1 ||
    rows < 1 ||
    index < 0 ||
    index >= frameCount ||
    sourceMetadata.width % columns !== 0 ||
    sourceMetadata.height % rows !== 0
  ) {
    throw new Error(`Invalid spritesheet frame for ${definition.filePath}`)
  }

  const frameWidth = sourceMetadata.width / columns
  const frameHeight = sourceMetadata.height / rows
  return sharp(definition.filePath)
    .extract({
      left: (index % columns) * frameWidth,
      top: Math.floor(index / columns) * frameHeight,
      width: frameWidth,
      height: frameHeight,
    })
    .png()
    .toBuffer()
}
