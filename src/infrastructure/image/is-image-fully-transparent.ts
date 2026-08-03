import sharp from "sharp"

export async function isImageFullyTransparent(image: Buffer): Promise<boolean> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let offset = info.channels - 1; offset < data.length; offset += info.channels) {
    if (data[offset] !== 0) {
      return false
    }
  }

  return true
}
