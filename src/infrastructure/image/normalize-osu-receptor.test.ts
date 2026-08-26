import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { normalizeOsuReceptorImage } from "./normalize-osu-receptor.ts"

test("trims vertical transparency and uses square note proportions", async () => {
  const pixels = Buffer.alloc(8 * 14 * 4)
  for (let y = 3; y <= 10; y += 1) {
    setPixel(pixels, 8, 2, y, [255, 0, 0, 255])
    setPixel(pixels, 8, 5, y, [0, 0, 255, 255])
  }
  const source = await sharp(pixels, { raw: { width: 8, height: 14, channels: 4 } })
    .png()
    .toBuffer()

  const output = await normalizeOsuReceptorImage(source, { width: 8, height: 8 })
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

  assert.deepEqual({ width: info.width, height: info.height }, { width: 8, height: 8 })
  for (let y = 0; y < info.height; y += 1) {
    assert.equal(pixel(data, info.width, 0, y)[3], 0)
    assert.equal(pixel(data, info.width, 7, y)[3], 0)
    assert.deepEqual([...pixel(data, info.width, 2, y)], [255, 0, 0, 255])
    assert.deepEqual([...pixel(data, info.width, 5, y)], [0, 0, 255, 255])
  }
})

test("normalizes a short visible region to square note proportions", async () => {
  const pixels = Buffer.alloc(10 * 8 * 4)
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 1; x <= 8; x += 1) {
      setPixel(pixels, 10, x, y, [40, 180, 90, 255])
    }
  }
  const source = await sharp(pixels, { raw: { width: 10, height: 8, channels: 4 } })
    .png()
    .toBuffer()

  const output = await normalizeOsuReceptorImage(source, { width: 10, height: 10 })
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

  assert.deepEqual({ width: info.width, height: info.height }, { width: 10, height: 10 })
  assert.deepEqual([...pixel(data, info.width, 4, 0)], [40, 180, 90, 255])
  assert.deepEqual([...pixel(data, info.width, 4, 9)], [40, 180, 90, 255])
})

test("normalizes receptor height from a rectangular note using receptor width as the base", async () => {
  const pixels = Buffer.alloc(6 * 12 * 4)
  for (let y = 2; y <= 9; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      setPixel(pixels, 6, x, y, [120, 60, 200, 255])
    }
  }
  const source = await sharp(pixels, { raw: { width: 6, height: 12, channels: 4 } })
    .png()
    .toBuffer()

  const output = await normalizeOsuReceptorImage(source, { width: 6, height: 9 })
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

  assert.deepEqual({ width: info.width, height: info.height }, { width: 6, height: 9 })
  assert.deepEqual([...pixel(data, info.width, 3, 0)], [120, 60, 200, 255])
  assert.deepEqual([...pixel(data, info.width, 3, 8)], [120, 60, 200, 255])
})

test("normalizes a fully transparent receptor to the note proportions", async () => {
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

  const output = await normalizeOsuReceptorImage(source, { width: 6, height: 2 })

  const metadata = await sharp(output).metadata()
  assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 6, height: 2 })
})

test("trims and renders textured receptors to final dimensions in one resize", async () => {
  const width = 7
  const height = 9
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x + y) % 2 === 0 ? 255 : 0
      setPixel(pixels, width, x, y, [value, 255 - value, value, 255])
    }
  }
  const source = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  const target = { width: 146, height: 73 } as const

  const output = await sharp(await normalizeOsuReceptorImage(source, target))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const expected = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .extract({ left: 0, top: 1, width, height: 7 })
    .resize({ ...target, fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  assert.deepEqual(
    { width: output.info.width, height: output.info.height },
    { width: 146, height: 73 },
  )
  assert.deepEqual(output.data, expected.data)
})

test("rejects invalid target dimensions with normalization context", async () => {
  const source = await sharp({
    create: {
      width: 6,
      height: 6,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer()

  for (const targetDimensions of [
    { width: 0, height: 1 },
    { width: 1, height: 0 },
    { width: 1.5, height: 1 },
    { width: 1, height: Number.NaN },
  ]) {
    await assert.rejects(
      () => normalizeOsuReceptorImage(source, targetDimensions),
      (error) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /normalize osu! receptor image/i)
        assert.ok(error.cause instanceof Error)
        assert.match(error.cause.message, /target dimensions must be positive integers/i)
        return true
      },
    )
  }
})

test("adds receptor-normalization context to undecodable images", async () => {
  await assert.rejects(
    () => normalizeOsuReceptorImage(Buffer.from("not an image"), { width: 1, height: 1 }),
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
