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
  const png = (image: Vips.Image): Uint8Array => new Uint8Array(image.writeToBuffer(".png"))
  function color(image: Vips.Image, hold: (image: Vips.Image) => Vips.Image): Vips.Image {
    if (image.getTypeof("icc-profile-data") !== 0)
      return hold(image.iccTransform("srgb", { embedded: true, depth: 8, intent: "perceptual" }))
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
        let image = alpha(color(load(bytes), hold), hold)
        if (angle !== 0)
          image = hold(
            angle % 90 === 0
              ? image.rot(`d${angle}`)
              : image.rotate(angle, { background: [0, 0, 0, 255] }),
          )
        return png(image)
      })
    },
    async resize(bytes, options) {
      return scope((hold, load) => {
        let image = color(load(bytes), hold)
        const { width, height } = resizeDimensions(image.width, image.height, options)
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
        const interpolate = module.Interpolate.newFromName("bicubic")
        try {
          return png(
            hold(
              alpha(color(load(bytes), hold), hold).affine([1, 0, 0, scale], {
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
        const image = hold(alpha(color(load(bytes), hold), hold).cast("uchar"))
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
