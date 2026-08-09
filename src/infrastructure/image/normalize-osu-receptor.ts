import sharp from "sharp"

export async function normalizeOsuReceptorImage(image: Buffer): Promise<Buffer> {
  try {
    const { data, info } = await sharp(image)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    if (
      !Number.isInteger(info.width) ||
      !Number.isInteger(info.height) ||
      !Number.isInteger(info.channels) ||
      info.width <= 0 ||
      info.height <= 0 ||
      info.channels !== 4
    ) {
      throw new Error("Decoded receptor dimensions must be positive RGBA integers")
    }

    let firstVisibleRow = -1
    let lastVisibleRow = -1

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const alphaOffset = (y * info.width + x) * info.channels + 3
        if (data[alphaOffset] !== 0) {
          firstVisibleRow = firstVisibleRow < 0 ? y : firstVisibleRow
          lastVisibleRow = y
          break
        }
      }
    }

    if (firstVisibleRow < 0) {
      return image
    }

    return sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({
        left: 0,
        width: info.width,
        top: firstVisibleRow,
        height: lastVisibleRow - firstVisibleRow + 1,
      })
      .resize({ width: info.width, height: info.width, fit: "fill" })
      .png()
      .toBuffer()
  } catch (cause) {
    throw new Error("Could not normalize osu! receptor image", { cause })
  }
}
