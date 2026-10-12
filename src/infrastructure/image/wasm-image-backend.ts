import type Vips from "wasm-vips"
import VipsFactory from "wasm-vips"
import type { RasterBackend, RasterResize } from "./raster-backend.ts"

export type VipsModule = Awaited<ReturnType<typeof VipsFactory>>
export async function initializeBrowserVips(assetDirectory: URL): Promise<VipsModule> {
  if (!globalThis.crossOriginIsolated)
    throw new Error(
      "Image processing requires browser isolation. Reload this page after its service worker is ready.",
    )
  try {
    const module = await VipsFactory({
      locateFile: (name) => new URL(name, assetDirectory).href,
      mainScriptUrlOrBlob: new URL("vips-es6.js", assetDirectory).href,
      dynamicLibraries: [],
    })
    module.concurrency(1)
    module.Cache.max(0)
    return module
  } catch (cause) {
    throw new Error(
      "Could not initialize local image processing. Check that the site's WASM resources are available.",
      { cause },
    )
  }
}

export function createWasmImageBackend(module: VipsModule): RasterBackend {
  let disposed = false
  function scope<T>(
    job: (hold: (image: Vips.Image) => Vips.Image, load: (bytes: Uint8Array) => Vips.Image) => T,
  ): T {
    if (disposed) throw new Error("Image processor was disposed")
    const handles: Vips.Image[] = []
    const hold = (image: Vips.Image): Vips.Image => {
      handles.push(image)
      return image
    }
    const load = (bytes: Uint8Array): Vips.Image => {
      if (bytes.byteLength > 32 * 1024 * 1024)
        throw new Error("Image exceeds the 32 MiB encoded limit")
      const image = hold(module.Image.newFromBuffer(bytes, "", { fail_on: "warning" }))
      if (image.width * image.height > 16_000_000)
        throw new Error("Image exceeds the 16 megapixel decoded limit")
      return image
    }
    try {
      return job(hold, load)
    } finally {
      for (const handle of handles.reverse()) handle.delete()
    }
  }
  // Sharp's default encoder strips source metadata after transforming to sRGB.
  const assertOutput = (width: number, height: number) => {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1 ||
      Math.ceil(width) * Math.ceil(height) > 16_000_000
    )
      throw new Error("Output image exceeds the 16 megapixel limit")
  }
  const png = (image: Vips.Image): Uint8Array => {
    assertOutput(image.width, image.height)
    let converted: Vips.Image | undefined
    try {
      if (image.interpretation !== "srgb") converted = image.colourspace("srgb")
      return new Uint8Array((converted ?? image).writeToBuffer(".png", { strip: true }))
    } finally {
      converted?.delete()
    }
  }
  function color(image: Vips.Image, hold: (image: Vips.Image) => Vips.Image): Vips.Image {
    if (image.getTypeof("icc-profile-data") !== 0)
      return hold(
        image.iccTransform(image.interpretation === "rgb16" ? "p3" : "srgb", {
          embedded: true,
          depth: image.interpretation === "rgb16" ? 16 : 8,
          intent: "perceptual",
        }),
      )
    if (image.interpretation === "rgb16") return image
    return hold(image.colourspace("srgb"))
  }
  const alpha = (image: Vips.Image, hold: (image: Vips.Image) => Vips.Image): Vips.Image =>
    image.hasAlpha() ? image : hold(image.addalpha())
  return {
    async dimensions(bytes) {
      return scope((_, load) => {
        const image = load(bytes)
        return { width: image.width, height: image.height }
      })
    },
    async ensureAlpha(bytes) {
      return scope((hold, load) => png(alpha(color(load(bytes), hold), hold)))
    },
    async extract(bytes, rect) {
      return scope((hold, load) =>
        png(
          hold(color(load(bytes), hold).extractArea(rect.left, rect.top, rect.width, rect.height)),
        ),
      )
    },
    async rotate(bytes, angle) {
      return scope((hold, load) => {
        let image = color(load(bytes), hold)
        if (angle !== 0)
          image = hold(
            angle % 90 === 0
              ? image.rot(`d${angle}`)
              : image.rotate(angle, {
                  background: image.hasAlpha()
                    ? [0, 0, 0, image.format === "ushort" ? 65280 : 255]
                    : [0, 0, 0],
                }),
          )
        return png(alpha(image, hold))
      })
    },
    async resize(bytes, options) {
      return scope((hold, load) => {
        let image = color(load(bytes), hold)
        const { width, height } = resizeDimensions(image.width, image.height, options)
        assertOutput(width, height)
        if (width === image.width && height === image.height) return png(image)
        const format = image.format
        const hasAlpha = image.hasAlpha()
        const scale = width / image.width,
          vscale = height / image.height
        if (hasAlpha) image = hold(hold(image.premultiply()).cast(format))
        image = hold(image.resize(scale, { vscale, kernel: "lanczos3" }))
        if (hasAlpha) image = hold(hold(image.unpremultiply()).cast(format))
        return png(image)
      })
    },
    async affineVertical(bytes, scale) {
      return scope((hold, load) => {
        const source = alpha(color(load(bytes), hold), hold)
        assertOutput(source.width, source.height * Math.abs(scale))
        const interpolate = module.Interpolate.newFromName("bicubic")
        try {
          return png(
            hold(
              source.affine([1, 0, 0, scale], {
                interpolate,
                background: [0, 0, 0, 0],
                idx: 0,
                idy: 0,
                odx: 0,
                ody: 0,
              }),
            ),
          )
        } finally {
          interpolate.delete()
        }
      })
    },
    async decodeRgba(bytes) {
      return scope((hold, load) => {
        const image = hold(
          hold(alpha(color(load(bytes), hold), hold).colourspace("srgb")).cast("uchar"),
        )
        return {
          width: image.width,
          height: image.height,
          pixels: new Uint8Array(image.writeToMemory()),
        }
      })
    },
    async compose(width, height, overlays) {
      return scope((hold, load) => {
        if (width * height > 16_000_000)
          throw new Error("Output image exceeds the 16 megapixel limit")
        const canvas = hold(
          hold(module.Image.black(width, height, { bands: 4 })).copy({ interpretation: "srgb" }),
        )
        const images = overlays.map((overlay) =>
          alpha(
            color(
              overlay.raw
                ? hold(
                    hold(
                      module.Image.newFromMemory(
                        overlay.image,
                        overlay.raw.width,
                        overlay.raw.height,
                        4,
                        module.BandFormat.uchar,
                      ),
                    ).copy({ interpretation: "srgb" }),
                  )
                : load(overlay.image),
              hold,
            ),
            hold,
          ),
        )
        const result = hold(
          canvas.composite(images, module.BlendMode.over, {
            x: overlays.map((o) => o.left),
            y: overlays.map((o) => o.top),
            compositing_space: "srgb",
          }),
        )
        return png(result)
      })
    },
    async dispose() {
      if (!disposed) {
        disposed = true
        module.shutdown()
      }
    },
  }
}
function resizeDimensions(
  width: number,
  height: number,
  options: RasterResize,
): { width: number; height: number } {
  let targetWidth = options.width ?? (width * (options.height ?? height)) / height
  let targetHeight = options.height ?? (height * targetWidth) / width
  if (options.fit === "inside") {
    let scale = Math.min(targetWidth / width, targetHeight / height)
    if (options.withoutEnlargement) scale = Math.min(1, scale)
    targetWidth = width * scale
    targetHeight = height * scale
  }
  return { width: targetWidth, height: targetHeight }
}
