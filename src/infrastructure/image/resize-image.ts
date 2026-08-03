import sharp from "sharp"

export async function resizeImageProportionally(image: Buffer, scale: number): Promise<Buffer> {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Image scale must be positive finite")
  }

  const metadata = await sharp(image).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions")
  }

  const width = Math.max(1, Math.round(metadata.width * scale))
  const height = Math.max(1, Math.round(metadata.height * scale))

  return sharp(image)
    .resize({ width, height, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .png()
    .toBuffer()
}
