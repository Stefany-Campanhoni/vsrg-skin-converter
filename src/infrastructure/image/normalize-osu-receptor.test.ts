import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { normalizeOsuReceptorImage } from "./normalize-osu-receptor.ts"

test("trims only vertical transparency and preserves lateral receptor geometry", async () => {
  const pixels = Buffer.alloc(8 * 14 * 4)
  for (let y = 3; y <= 10; y += 1) {
    setPixel(pixels, 8, 2, y, [255, 0, 0, 255])
    setPixel(pixels, 8, 5, y, [0, 0, 255, 255])
  }
  const source = await sharp(pixels, { raw: { width: 8, height: 14, channels: 4 } })
    .png()
    .toBuffer()

  const output = await normalizeOsuReceptorImage(source)
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

  assert.deepEqual({ width: info.width, height: info.height }, { width: 8, height: 8 })
  for (let y = 0; y < info.height; y += 1) {
    assert.equal(pixel(data, info.width, 0, y)[3], 0)
    assert.equal(pixel(data, info.width, 7, y)[3], 0)
    assert.deepEqual([...pixel(data, info.width, 2, y)], [255, 0, 0, 255])
    assert.deepEqual([...pixel(data, info.width, 5, y)], [0, 0, 255, 255])
  }
})

test("stretches a short visible region vertically to a square", async () => {
  const pixels = Buffer.alloc(10 * 8 * 4)
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 1; x <= 8; x += 1) {
      setPixel(pixels, 10, x, y, [40, 180, 90, 255])
    }
  }
  const source = await sharp(pixels, { raw: { width: 10, height: 8, channels: 4 } })
    .png()
    .toBuffer()

  const output = await normalizeOsuReceptorImage(source)
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

  assert.deepEqual({ width: info.width, height: info.height }, { width: 10, height: 10 })
  assert.deepEqual([...pixel(data, info.width, 4, 0)], [40, 180, 90, 255])
  assert.deepEqual([...pixel(data, info.width, 4, 9)], [40, 180, 90, 255])
})

test("returns a fully transparent receptor byte-for-byte", async () => {
  const source = await sharp({
    create: {
      width: 6,
      height: 9,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer()

  const output = await normalizeOsuReceptorImage(source)

  assert.deepEqual(output, source)
})

test("adds receptor-normalization context to undecodable images", async () => {
  await assert.rejects(
    () => normalizeOsuReceptorImage(Buffer.from("not an image")),
    /normalize osu! receptor image/i,
  )
})

function setPixel(
  data: Buffer,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
): void {
  data.set(color, (y * width + x) * 4)
}

function pixel(data: Buffer, width: number, x: number, y: number): Buffer {
  const offset = (y * width + x) * 4
  return data.subarray(offset, offset + 4)
}
