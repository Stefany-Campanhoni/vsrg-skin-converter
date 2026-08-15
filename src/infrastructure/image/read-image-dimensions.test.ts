import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
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

  assert.deepEqual(await readImageDimensions(image), { width: 13, height: 21 })
})

test("retains decoder failures as the cause of a contextual dimensions error", async () => {
  await assert.rejects(
    () => readImageDimensions(Buffer.from("not an image")),
    (error) =>
      error instanceof Error &&
      /read image dimensions/i.test(error.message) &&
      error.cause instanceof Error,
  )
})
