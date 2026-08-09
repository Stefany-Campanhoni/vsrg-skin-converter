import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { resizeImageExact } from "./resize-image-exact.ts"

test("stretches a non-square PNG to the exact requested dimensions", async () => {
  const source = await sharp({
    create: {
      width: 20,
      height: 10,
      channels: 4,
      background: { r: 30, g: 90, b: 150, alpha: 1 },
    },
  })
    .png()
    .toBuffer()

  const resized = await resizeImageExact(source, { width: 150, height: 150 })

  assert.deepEqual(await imageSize(resized), { width: 150, height: 150 })
})

test("preserves transparency at the requested dimensions", async () => {
  const source = await sharp({
    create: {
      width: 20,
      height: 10,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer()

  const resized = await resizeImageExact(source, { width: 150, height: 150 })
  const { data, info } = await sharp(resized).raw().toBuffer({ resolveWithObject: true })

  assert.deepEqual({ width: info.width, height: info.height }, { width: 150, height: 150 })
  assert.ok([...data.filter((_, index) => index % 4 === 3)].every((alpha) => alpha === 0))
})

test("rejects invalid dimensions before decoding the image", async () => {
  for (const [field, value] of [
    ["width", 0],
    ["width", -1],
    ["width", 1.5],
    ["width", Number.NaN],
    ["width", Number.POSITIVE_INFINITY],
    ["height", 0],
    ["height", -1],
    ["height", 1.5],
    ["height", Number.NaN],
    ["height", Number.POSITIVE_INFINITY],
  ] as const) {
    const size = field === "width" ? { width: value, height: 1 } : { width: 1, height: value }

    await assert.rejects(
      () => resizeImageExact(Buffer.from("invalid"), size),
      new RegExp(field, "i"),
    )
  }
})

test("retains undecodable image errors as the cause of contextual resize errors", async () => {
  await assert.rejects(
    () => resizeImageExact(Buffer.from("invalid"), { width: 146, height: 146 }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /resize image.*146.*146/i)
      assert.ok(error.cause instanceof Error)
      return true
    },
  )
})

async function imageSize(image: Buffer): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(image).metadata()
  assert.ok(width !== undefined)
  assert.ok(height !== undefined)
  return { width, height }
}
