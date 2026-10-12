import { getOsuReceptorVerticalScale } from "../../src/adapters/osu/writer/osu-receptor-calibration.ts"
import type { ImageAsset } from "../../src/domain/image.ts"
import { createImageOperations } from "../../src/infrastructure/image/shared-image-operations.ts"
import {
  createWasmImageBackend,
  initializeBrowserVips,
} from "../../src/infrastructure/image/wasm-image-backend.ts"

declare global {
  interface Window {
    runImageLimitProbe: () => Promise<boolean>
    runImageCorpusParity: () => Promise<
      readonly { name: string; width: number; height: number; pixelSha256: string }[]
    >
    runImageParity: () => Promise<
      Record<string, { width: number; height: number; pixels: number[] }>
    >
  }
}
window.runImageLimitProbe = async () => {
  const backend = createWasmImageBackend(
    await initializeBrowserVips(new URL("./vips/", location.href)),
  )
  try {
    const source = new Uint8Array(
      await (await fetch(new URL("./reference/source.png", location.href))).arrayBuffer(),
    )
    try {
      await backend.resize(source, {
        width: 4097,
        height: 4097,
        fit: "fill",
        withoutEnlargement: false,
        kernel: "lanczos3",
      })
      return false
    } catch (error) {
      return error instanceof Error && error.message.includes("16 megapixel")
    }
  } finally {
    await backend.dispose()
  }
}
window.runImageCorpusParity = async () => {
  const response = await fetch(new URL("./reference/corpus.json", location.href))
  if (response.status === 404) return []
  const value: unknown = await response.json()
  if (!Array.isArray(value)) throw new Error("Invalid corpus")
  const entries: readonly unknown[] = value
  const backend = createWasmImageBackend(
    await initializeBrowserVips(new URL("./vips/", location.href)),
  )
  const images = createImageOperations(
    {
      async read(name) {
        const file = await fetch(new URL(`./reference/${name}`, location.href))
        if (!file.ok) throw new Error("Missing corpus source")
        return new Uint8Array(await file.arrayBuffer())
      },
    },
    backend,
  )
  const results: { name: string; width: number; height: number; pixelSha256: string }[] = []
  try {
    for (const item of entries) {
      if (
        !item ||
        typeof item !== "object" ||
        !("name" in item) ||
        typeof item.name !== "string" ||
        !("asset" in item) ||
        !isAsset(item.asset)
      )
        throw new Error("Invalid corpus entry")
      const decoded = await backend.decodeRgba(await images.renderNote(item.asset))
      const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(decoded.pixels))
      results.push({
        name: item.name,
        width: decoded.width,
        height: decoded.height,
        pixelSha256: [...new Uint8Array(hash)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(""),
      })
    }
  } finally {
    await backend.dispose()
  }
  return results
}
function isAsset(value: unknown): value is ImageAsset {
  if (
    !value ||
    typeof value !== "object" ||
    !("filePath" in value) ||
    typeof value.filePath !== "string" ||
    !("rotation" in value) ||
    typeof value.rotation !== "number"
  )
    return false
  if (!("frame" in value) || value.frame === undefined) return true
  const frame = value.frame
  return (
    !!frame &&
    typeof frame === "object" &&
    ["index", "columns", "rows"].every(
      (key) => key in frame && typeof (frame as Record<string, unknown>)[key] === "number",
    )
  )
}
window.runImageParity = async () => {
  const backend = createWasmImageBackend(
    await initializeBrowserVips(new URL("./vips/", location.href)),
  )
  const loader = {
    async read(name: string) {
      const r = await fetch(new URL(`./reference/${name}`, location.href))
      if (!r.ok) throw new Error("Missing fixture")
      return new Uint8Array(await r.arrayBuffer())
    },
  }
  const ops = createImageOperations(loader, backend)
  const source = await loader.read("source.png")
  const outputs = new Map<string, Uint8Array>()
  const jpegRendered = await ops.renderNote({ filePath: "source.jpg", rotation: 17 })
  outputs.set("jpeg-zero", await ops.renderNote({ filePath: "source.jpg", rotation: 0 }))
  outputs.set("jpeg-icc", jpegRendered)
  outputs.set("jpeg-reduction", await ops.resizeToWidth(jpegRendered, 150))
  for (const rotation of [0, 90, 180, 270, 17])
    outputs.set(`rotate-${rotation}`, await ops.renderNote({ filePath: "source.png", rotation }))
  outputs.set(
    "frame",
    await ops.renderNote({
      filePath: "source.png",
      rotation: 0,
      frame: { index: 3, columns: 2, rows: 3 },
    }),
  )
  for (const scale of [0.5, 1, 2])
    outputs.set(`scale-${scale}`, await ops.resizeProportionally(source, scale))
  for (const width of [24, 12, 150])
    outputs.set(`width-${width}`, await ops.resizeToWidth(source, width))
  outputs.set("exact", await ops.resizeExact(source, { width: 146, height: 117 }))
  outputs.set("normalize", await ops.normalizeReceptor(source, { width: 146, height: 117 }))
  outputs.set(
    "sheet",
    await ops.composeVerticalSheet(
      [...outputs]
        .filter(([name]) => name.startsWith("rotate-") || name === "frame")
        .map(([, image], index) => ({ label: `${index}`, image })),
    ),
  )
  for (const hitPosition of [432, 438, 439])
    for (const width of [46, 62, 70])
      outputs.set(
        `receptor-${hitPosition}-${width}`,
        await ops.renderReceptor(
          { filePath: "source.png", rotation: 17 },
          {
            hitPosition,
            referenceHitPosition: 438,
            pixelsPerHitPositionPoint: 2,
            verticalScale: getOsuReceptorVerticalScale(width),
            logicalCanvasHeight: 480,
            pixelsPerLogicalPoint: 3.2,
            logicalBottomOffset: 1.5,
            normalizationSize: 150,
            baseImagePath: "base.png",
          },
        ),
      )
  const result: Record<string, { width: number; height: number; pixels: number[] }> = {}
  for (const [name, image] of outputs) {
    const decoded = await backend.decodeRgba(image)
    result[name] = {
      width: decoded.width,
      height: decoded.height,
      pixels: Array.from(decoded.pixels),
    }
  }
  await backend.dispose()
  return result
}
