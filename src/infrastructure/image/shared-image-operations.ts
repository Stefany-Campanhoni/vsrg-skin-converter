import type { AssetLoader } from "../../application/ports/asset-loader.ts"
import type {
  CenteredSpriteSheetFrame,
  ImageDimensions,
  ImageOperations,
} from "../../application/ports/image-operations.ts"
import { invokeAsPromise, settleAll } from "../async/settle-all.ts"
import type { RasterBackend, RgbaImage } from "./raster-backend.ts"
import { getReceptorBottomPadding, getReceptorCanvasHeight } from "./receptor-geometry.ts"

export function createImageOperations(
  loader: AssetLoader,
  backend: RasterBackend,
): ImageOperations {
  const operations: ImageOperations = {
    dimensions: (image) => backend.dimensions(image),
    async extractFrame(asset) {
      const image = await loader.read(asset.filePath)
      const metadata = await backend.dimensions(image)
      if (!asset.frame) return image
      const { index, columns, rows } = asset.frame
      if (
        columns < 1 ||
        rows < 1 ||
        index < 0 ||
        index >= columns * rows ||
        metadata.width % columns !== 0 ||
        metadata.height % rows !== 0
      )
        throw new Error(`Invalid spritesheet frame for ${asset.filePath}`)
      const width = metadata.width / columns,
        height = metadata.height / rows
      return backend.extract(image, {
        left: (index % columns) * width,
        top: Math.floor(index / columns) * height,
        width,
        height,
      })
    },
    async renderNote(asset) {
      return backend.rotate(
        await operations.extractFrame(asset),
        ((asset.rotation % 360) + 360) % 360,
      )
    },
    async renderReceptor(asset, options) {
      const baseMetadata = await backend.dimensions(await loader.read(options.baseImagePath))
      if (!Number.isInteger(options.normalizationSize) || options.normalizationSize <= 0)
        throw new Error("Receptor normalization size must be a positive integer")
      const rotated = await operations.renderNote(asset)
      const rotatedMetadata = await backend.dimensions(rotated)
      const normalized = await backend.ensureAlpha(
        await backend.resize(rotated, {
          width: options.normalizationSize,
          ...(rotatedMetadata.width >= options.normalizationSize
            ? { height: options.normalizationSize, withoutEnlargement: true }
            : { withoutEnlargement: false }),
          fit: "inside",
          kernel: "lanczos3",
        }),
      )
      const stretched = await backend.affineVertical(normalized, options.verticalScale)
      const decoded = await backend.decodeRgba(stretched)
      const rows = visibleRows(decoded)
      const visible =
        rows.last < 0 || rows.last === decoded.height - 1
          ? stretched
          : await backend.extract(stretched, {
              left: 0,
              top: 0,
              width: decoded.width,
              height: rows.last + 1,
            })
      const metadata = await backend.dimensions(visible)
      const bottom = getReceptorBottomPadding(
        options.hitPosition,
        options.logicalCanvasHeight,
        options.pixelsPerLogicalPoint,
        options.logicalBottomOffset,
      )
      const height = getReceptorCanvasHeight(
        options.hitPosition,
        baseMetadata.height,
        metadata.height,
        options.referenceHitPosition,
        options.pixelsPerHitPositionPoint,
        bottom,
      )
      return backend.compose(baseMetadata.width, height, [
        {
          image: visible,
          left: Math.floor((baseMetadata.width - metadata.width) / 2),
          top: height - bottom - metadata.height,
        },
      ])
    },
    async renderJudgementVariants(asset, density, scale) {
      const original = await backend.ensureAlpha(await operations.extractFrame(asset))
      await backend.dimensions(original)
      return {
        standardResolution: await operations.resizeProportionally(original, scale / density),
        doubleResolution: await operations.resizeProportionally(original, (scale * 2) / density),
      }
    },
    async resizeProportionally(image, scale) {
      if (!Number.isFinite(scale) || scale <= 0)
        throw new Error("Image scale must be positive finite")
      const meta = await backend.dimensions(image)
      return backend.ensureAlpha(
        await backend.resize(image, {
          width: Math.max(1, Math.round(meta.width * scale)),
          height: Math.max(1, Math.round(meta.height * scale)),
          fit: "fill",
          withoutEnlargement: false,
          kernel: "lanczos3",
        }),
      )
    },
    async resizeToWidth(image, width) {
      assertPositiveInteger(width, "target width")
      try {
        if ((await backend.dimensions(image)).width === width) return image
        return await backend.resize(image, {
          width,
          fit: "inside",
          withoutEnlargement: false,
          kernel: "lanczos3",
        })
      } catch (cause) {
        throw new Error(`Could not resize image proportionally to width ${width}`, { cause })
      }
    },
    async resizeExact(image, size) {
      assertPositiveInteger(size.width, "width")
      assertPositiveInteger(size.height, "height")
      try {
        return await backend.resize(image, {
          ...size,
          fit: "fill",
          withoutEnlargement: false,
          kernel: "lanczos3",
        })
      } catch (cause) {
        throw new Error(`Could not resize image to ${size.width}x${size.height}`, { cause })
      }
    },
    async normalizeReceptor(image, size) {
      try {
        if (
          !Number.isInteger(size.width) ||
          !Number.isInteger(size.height) ||
          size.width <= 0 ||
          size.height <= 0
        )
          throw new Error("Target dimensions must be positive integers")
        const decoded = await backend.decodeRgba(image)
        const rows = visibleRows(decoded)
        const rgba = await backend.ensureAlpha(image)
        const trimmed =
          rows.first < 0
            ? rgba
            : await backend.extract(rgba, {
                left: 0,
                top: rows.first,
                width: decoded.width,
                height: rows.last - rows.first + 1,
              })
        return await backend.resize(trimmed, {
          ...size,
          fit: "fill",
          withoutEnlargement: false,
          kernel: "lanczos3",
        })
      } catch (cause) {
        throw new Error("Could not normalize osu! receptor image", { cause })
      }
    },
    async isTransparent(image) {
      return visibleRows(await backend.decodeRgba(image)).first < 0
    },
    composeVerticalSheet: (frames) => composeVerticalSheet(frames, backend),
  }
  return operations
}
function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`)
}
function visibleRows(image: ImageDimensions & { pixels: Uint8Array }): {
  first: number
  last: number
} {
  let first = -1,
    last = -1
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if (image.pixels[(y * image.width + x) * 4 + 3] !== 0) {
        if (first < 0) first = y
        last = y
        break
      }
  return { first, last }
}

export async function composeVerticalSheet(
  frames: readonly CenteredSpriteSheetFrame[],
  backend: RasterBackend,
  decode: (image: Uint8Array, index: number) => Promise<RgbaImage> = (image) =>
    backend.decodeRgba(image),
): Promise<Uint8Array> {
  if (frames.length === 0)
    throw new Error("A centered vertical sprite sheet requires at least one frame")
  const decoded = await settleAll(
    frames.map((frame, index) =>
      invokeAsPromise(async () => {
        try {
          const result = await decode(frame.image, index)
          assertPositiveInteger(result.width, "Frame width")
          assertPositiveInteger(result.height, "Frame height")
          if (result.pixels.length !== result.width * result.height * 4)
            throw new Error("Invalid decoded RGBA sprite sheet frame")
          return result
        } catch (cause) {
          throw new Error(`Could not decode sprite sheet frame ${index} (${frame.label})`, {
            cause,
          })
        }
      }),
    ),
  )
  const width = Math.max(...decoded.map((f) => f.width)),
    height = Math.max(...decoded.map((f) => f.height))
  try {
    return await backend.compose(
      width,
      height * frames.length,
      frames.map((_frame, index) => {
        const dimensions = decoded[index]
        if (!dimensions) throw new Error("Missing decoded frame")
        return {
          image: dimensions.pixels,
          raw: { width: dimensions.width, height: dimensions.height },
          left: Math.floor((width - dimensions.width) / 2),
          top: index * height + Math.floor((height - dimensions.height) / 2),
        }
      }),
    )
  } catch (cause) {
    throw new Error("Could not compose centered vertical sprite sheet", { cause })
  }
}
