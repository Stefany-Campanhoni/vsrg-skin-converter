import { expect, test } from "bun:test"
import sharp from "sharp"
import { expectTruthy } from "../../../tests/support/expectations.ts"
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
  expect({ width: scaledMetadata.width, height: scaledMetadata.height }).toStrictEqual({
    width: 6,
    height: 4,
  })
  const scaledRaw = await sharp(scaled).raw().toBuffer({ resolveWithObject: true })
  expectTruthy(
    [...scaledRaw.data.filter((_, index) => index % 4 === 3)].every((alpha) => alpha === 127),
  )

  const minimum = await resizeImageProportionally(image, 0.01)
  const minimumMetadata = await sharp(minimum).metadata()
  expect({ width: minimumMetadata.width, height: minimumMetadata.height }).toStrictEqual({
    width: 1,
    height: 1,
  })
})

test("rejects non-positive and non-finite scales", async () => {
  const image = await createRgbaPng()

  await expect((() => resizeImageProportionally(image, 0))()).rejects.toThrow(/positive finite/i)
  await expect((() => resizeImageProportionally(image, Number.NaN))()).rejects.toThrow(
    /positive finite/i,
  )
  await expect(
    (() => resizeImageProportionally(image, Number.POSITIVE_INFINITY))(),
  ).rejects.toThrow(/positive finite/i)
})
