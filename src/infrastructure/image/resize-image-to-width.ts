import sharp from "sharp"

export async function resizeImageToWidth(image: Buffer, targetWidth: number): Promise<Buffer> {
  if (!Number.isInteger(targetWidth) || targetWidth <= 0) {
    throw new Error("target width must be a positive integer")
  }

  try {
    const metadata = await sharp(image).metadata()
    if (metadata.width === targetWidth) return image

    return await sharp(image).resize({ width: targetWidth }).png().toBuffer()
  } catch (cause) {
    throw new Error(`Could not resize image proportionally to width ${targetWidth}`, { cause })
  }
}
