import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { isImageFullyTransparent } from "./is-image-fully-transparent.ts"

test("reports whether every image pixel is transparent", async () => {
  const transparent = await createPng({ r: 0, g: 0, b: 0, alpha: 0 })
  const visible = await createPng({ r: 255, g: 0, b: 0, alpha: 1 })

  assert.equal(await isImageFullyTransparent(transparent), true)
  assert.equal(await isImageFullyTransparent(visible), false)
})

test("rejects an invalid encoded image", async () => {
  await assert.rejects(() => isImageFullyTransparent(Buffer.from("not-an-image")))
})

function createPng(background: { r: number; g: number; b: number; alpha: number }) {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background,
    },
  })
    .png()
    .toBuffer()
}
