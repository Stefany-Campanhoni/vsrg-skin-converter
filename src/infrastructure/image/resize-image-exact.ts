import sharp from "sharp"

export interface ExactImageSize {
  readonly width: number
  readonly height: number
}

export async function resizeImageExact(image: Buffer, size: ExactImageSize): Promise<Buffer> {
  assertPositiveInteger(size.width, "width")
  assertPositiveInteger(size.height, "height")

  try {
    return await sharp(image)
      .resize({ width: size.width, height: size.height, fit: "fill" })
      .png()
      .toBuffer()
  } catch (cause) {
    throw new Error(`Could not resize image to ${size.width}x${size.height}`, { cause })
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`)
  }
}
