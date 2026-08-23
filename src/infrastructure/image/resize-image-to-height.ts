import sharp from "sharp"

export async function resizeImageToHeight(image: Buffer, targetHeight: number): Promise<Buffer> {
  if (!Number.isInteger(targetHeight) || targetHeight <= 0) {
    throw new Error("target height must be a positive integer")
  }

  try {
    const metadata = await sharp(image).metadata()
    if (metadata.height === targetHeight) return image

    return await sharp(image).resize({ height: targetHeight }).png().toBuffer()
  } catch (cause) {
    throw new Error(`Could not resize image proportionally to height ${targetHeight}`, { cause })
  }
}
