import { expect, test } from "bun:test"
import sharp from "sharp"
import { isImageFullyTransparent } from "./is-image-fully-transparent.ts"

test("reports whether every image pixel is transparent", async () => {
  const transparent = await createPng({ r: 0, g: 0, b: 0, alpha: 0 })
  const visible = await createPng({ r: 255, g: 0, b: 0, alpha: 1 })

  expect(await isImageFullyTransparent(transparent)).toBe(true)
  expect(await isImageFullyTransparent(visible)).toBe(false)
})

test("rejects an invalid encoded image", async () => {
  await expect(
    (() => isImageFullyTransparent(new TextEncoder().encode("not-an-image")))(),
  ).rejects.toThrow()
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
