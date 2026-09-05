import { test } from "bun:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { resizeImageProportionally } from "./resize-image.ts"

async function createRgbaPng(): Promise<Buffer> {
  const pixels = Buffer.from(Array.from({ length: 10 * 6 }, () => [20, 40, 60, 127]).flat())

  return sharp(pixels, { raw: { width: 10, height: 6, channels: 4 } })
    .png()
    .toBuffer()
}

test("resizes RGBA PNGs proportionally with rounded dimensions and preserved alpha", async () => {
  const image = await createRgbaPng()

  const scaled = await resizeImageProportionally(image, 0.6)
  const scaledMetadata = await sharp(scaled).metadata()
  assert.deepEqual(
    { width: scaledMetadata.width, height: scaledMetadata.height },
    { width: 6, height: 4 },
  )
  const scaledRaw = await sharp(scaled).raw().toBuffer({ resolveWithObject: true })
  assert.ok(
    [...scaledRaw.data.filter((_, index) => index % 4 === 3)].every((alpha) => alpha === 127),
  )

  const minimum = await resizeImageProportionally(image, 0.01)
  const minimumMetadata = await sharp(minimum).metadata()
  assert.deepEqual(
    { width: minimumMetadata.width, height: minimumMetadata.height },
    { width: 1, height: 1 },
  )
})

test("rejects non-positive and non-finite scales", async () => {
  const image = await createRgbaPng()

  await assert.rejects(() => resizeImageProportionally(image, 0), /positive finite/i)
  await assert.rejects(() => resizeImageProportionally(image, Number.NaN), /positive finite/i)
  await assert.rejects(
    () => resizeImageProportionally(image, Number.POSITIVE_INFINITY),
    /positive finite/i,
  )
})
