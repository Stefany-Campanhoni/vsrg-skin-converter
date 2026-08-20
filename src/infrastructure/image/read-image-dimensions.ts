import sharp from "sharp"

export interface ImageDimensions {
  readonly width: number
  readonly height: number
}

export async function readImageDimensions(image: Buffer | string): Promise<ImageDimensions> {
  try {
    const metadata = await sharp(image).metadata()
    if (!metadata.width || !metadata.height) {
      throw new Error("Decoded image does not contain positive dimensions")
    }
    return { width: metadata.width, height: metadata.height }
  } catch (cause) {
    throw new Error("Could not read image dimensions", { cause })
  }
}
