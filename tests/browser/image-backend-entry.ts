import { getOsuReceptorVerticalScale } from "../../src/adapters/osu/writer/osu-receptor-calibration.ts"
import { createImageOperations } from "../../src/infrastructure/image/shared-image-operations.ts"
import {
  createWasmImageBackend,
  initializeBrowserVips,
} from "../../src/infrastructure/image/wasm-image-backend.ts"

declare global {
  interface Window {
    runImageParity: () => Promise<
      Record<string, { width: number; height: number; pixels: number[] }>
    >
  }
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
      [...outputs.values()].slice(0, 6).map((image, index) => ({ label: `${index}`, image })),
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
