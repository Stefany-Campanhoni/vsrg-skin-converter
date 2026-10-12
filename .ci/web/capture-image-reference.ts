import path from "node:path"
import sharp from "sharp"
import { getOsuReceptorVerticalScale } from "../../src/adapters/osu/writer/osu-receptor-calibration.ts"
import { composeCenteredVerticalSpriteSheet } from "../../src/infrastructure/image/compose-centered-vertical-sprite-sheet.ts"
import { normalizeOsuReceptorImage } from "../../src/infrastructure/image/normalize-osu-receptor.ts"
import { resizeImageProportionally } from "../../src/infrastructure/image/resize-image.ts"
import { resizeImageExact } from "../../src/infrastructure/image/resize-image-exact.ts"
import { resizeImageToWidth } from "../../src/infrastructure/image/resize-image-to-width.ts"
import {
  renderNoteImage,
  renderReceptorImage,
} from "../../src/infrastructure/image/sharp-image-processor.ts"
import { createAsymmetricImage, decodeReference } from "../../tests/support/image-reference.ts"

export async function captureImageReference(
  directory = path.resolve(".tmp/browser-reference"),
): Promise<void> {
  const source = await createAsymmetricImage()
  const sourcePath = path.join(directory, "source.png")
  await Bun.write(sourcePath, source)
  const basePath = path.join(directory, "base.png")
  await Bun.write(
    basePath,
    await sharp({
      create: { width: 150, height: 356, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer(),
  )
  const outputs = new Map<string, Uint8Array>()
  for (const rotation of [0, 90, 180, 270, 17])
    outputs.set(`rotate-${rotation}`, await renderNoteImage({ filePath: sourcePath, rotation }))
  outputs.set(
    "frame",
    await renderNoteImage({
      filePath: sourcePath,
      rotation: 0,
      frame: { index: 3, columns: 2, rows: 3 },
    }),
  )
  for (const scale of [0.5, 1, 2])
    outputs.set(`scale-${scale}`, await resizeImageProportionally(source, scale))
  for (const width of [24, 12, 150])
    outputs.set(`width-${width}`, await resizeImageToWidth(source, width))
  outputs.set("exact", await resizeImageExact(source, { width: 146, height: 117 }))
  outputs.set("normalize", await normalizeOsuReceptorImage(source, { width: 146, height: 117 }))
  outputs.set(
    "sheet",
    await composeCenteredVerticalSpriteSheet(
      [...outputs.values()].slice(0, 6).map((image, index) => ({ label: `${index}`, image })),
    ),
  )
  for (const hitPosition of [432, 438, 439])
    for (const width of [46, 62, 70])
      outputs.set(
        `receptor-${hitPosition}-${width}`,
        await renderReceptorImage(
          { filePath: sourcePath, rotation: 17 },
          {
            hitPosition,
            referenceHitPosition: 438,
            pixelsPerHitPositionPoint: 2,
            verticalScale: getOsuReceptorVerticalScale(width),
            logicalCanvasHeight: 480,
            pixelsPerLogicalPoint: 3.2,
            logicalBottomOffset: 1.5,
            normalizationSize: 150,
            baseImagePath: basePath,
          },
        ),
      )
  const manifest: Record<string, unknown> = {
    versions: sharp.versions,
    sourceSha256: new Bun.CryptoHasher("sha256").update(source).digest("hex"),
  }
  for (const [name, output] of outputs) {
    const decoded = await decodeReference(output)
    await Bun.write(path.join(directory, `${name}.png`), output)
    await Bun.write(path.join(directory, `${name}.rgba`), decoded.pixels)
    manifest[name] = {
      width: decoded.width,
      height: decoded.height,
      pixelSha256: new Bun.CryptoHasher("sha256").update(decoded.pixels).digest("hex"),
    }
  }
  await Bun.write(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2))
}
if (import.meta.main) await captureImageReference()
