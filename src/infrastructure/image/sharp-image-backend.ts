import sharp, { type OverlayOptions } from "sharp"
import type { RasterBackend } from "./raster-backend.ts"
export function createSharpImageBackend(): RasterBackend {
  return {
    async dimensions(image) {
      const meta = await sharp(image).metadata()
      if (!meta.width || !meta.height) throw new Error("Could not read image dimensions")
      return { width: meta.width, height: meta.height }
    },
    async ensureAlpha(image) {
      return sharp(image).ensureAlpha().png().toBuffer()
    },
    async extract(image, rect) {
      return sharp(image).extract(rect).png().toBuffer()
    },
    async rotate(image, angle) {
      return sharp(image).rotate(angle).ensureAlpha().png().toBuffer()
    },
    async resize(image, options) {
      return sharp(image).resize(options).png().toBuffer()
    },
    async affineVertical(image, scale) {
      return sharp(image)
        .affine([1, 0, 0, scale], {
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          interpolator: sharp.interpolators.bicubic,
        })
        .ensureAlpha()
        .png()
        .toBuffer()
    },
    async decodeRgba(image) {
      const { data, info } = await sharp(image)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      return { width: info.width, height: info.height, pixels: new Uint8Array(data) }
    },
    async compose(width, height, overlays) {
      return sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite(
          overlays.map(({ image, left, top, raw }) => ({
            input: image as NonNullable<OverlayOptions["input"]>,
            left,
            top,
            ...(raw ? { raw: { ...raw, channels: 4 as const } } : {}),
          })),
        )
        .png()
        .toBuffer()
    },
    async dispose() {},
  }
}
