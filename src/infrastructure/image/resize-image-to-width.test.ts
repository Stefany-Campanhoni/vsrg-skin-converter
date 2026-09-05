import { expect, test } from "bun:test"
import sharp from "sharp"
import { expectRejectionSatisfies, expectTruthy } from "../../../tests/support/expectations.ts"
import { resizeImageToWidth } from "./resize-image-to-width.ts"

test("scales image height proportionally to the target width", async () => {
  const source = await solidPng(20, 10, { r: 30, g: 90, b: 150, alpha: 0.5 })

  const output = await resizeImageToWidth(source, 150)
  const { data, info } = await sharp(output)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  expect({ width: info.width, height: info.height }).toStrictEqual({ width: 150, height: 75 })
  expectTruthy(Math.abs((data[0] ?? 0) - 30) <= 1)
  expectTruthy(Math.abs((data[1] ?? 0) - 90) <= 1)
  expectTruthy(Math.abs((data[2] ?? 0) - 150) <= 1)
  expect(data[3]).toBe(128)
})

for (const targetWidth of [150, 146]) {
  test(`returns a ${targetWidth}px-wide image byte-for-byte`, async () => {
    const source = await solidPng(targetWidth, 37, { r: 15, g: 45, b: 75, alpha: 1 })

    const output = await resizeImageToWidth(source, targetWidth)

    expect(output).toStrictEqual(source)
  })
}

test("rejects invalid target widths before decoding the image", async () => {
  for (const targetWidth of [0, -1, 1.5, Number.NaN]) {
    await expect(
      (() => resizeImageToWidth(Buffer.from("not an image"), targetWidth))(),
    ).rejects.toThrow(/target width must be a positive integer/i)
  }
})

test("retains decoder failures as the cause of contextual resize errors", async () => {
  await expectRejectionSatisfies(
    (() => resizeImageToWidth(Buffer.from("not an image"), 150))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/resize image proportionally to width 150/i)
      expectTruthy(error.cause instanceof Error)
      return true
    },
  )
})

function solidPng(
  width: number,
  height: number,
  background: { r: number; g: number; b: number; alpha: number },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer()
}
