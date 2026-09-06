import { expect, test } from "bun:test"
import sharp from "sharp"
import { expectRejectionSatisfies } from "../../../tests/support/expectations.ts"
import { readImageDimensions } from "./read-image-dimensions.ts"

test("reads the exact encoded image dimensions", async () => {
  const image = await sharp({
    create: {
      width: 13,
      height: 21,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer()

  expect(await readImageDimensions(image)).toStrictEqual({ width: 13, height: 21 })
})

test("retains decoder failures as the cause of a contextual dimensions error", async () => {
  await expectRejectionSatisfies(
    (() => readImageDimensions(new TextEncoder().encode("not an image")))(),
    (error) =>
      error instanceof Error &&
      /read image dimensions/i.test(error.message) &&
      error.cause instanceof Error,
  )
})
