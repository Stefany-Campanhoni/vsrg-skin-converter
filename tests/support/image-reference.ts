import sharp from "sharp"

export async function decodeReference(
  image: Uint8Array,
): Promise<{ readonly width: number; readonly height: number; readonly pixels: Uint8Array }> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, pixels: new Uint8Array(data) }
}

export async function createAsymmetricImage(): Promise<Uint8Array> {
  const width = 24
  const height = 18
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      data.set(
        [x * 10, y * 14, (x * 7 + y * 11) % 256, y < 2 || y > 14 ? 0 : (x * 17 + y * 23) % 256],
        (y * width + x) * 4,
      )
    }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}
