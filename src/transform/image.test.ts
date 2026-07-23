import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import type { ReceptorImage } from "../engine/receptor.ts"
import { getReceptorCanvasHeight, renderReceptorImage } from "./image.ts"

async function withImages(
  run: (paths: { directory: string; base: string; source: string }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-image-"))
  const base = path.join(directory, "base.png")
  const source = path.join(directory, "source.png")
  try {
    await sharp({
      create: {
        width: 150,
        height: 356,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(base)
    await run({ directory, base, source })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("calculates linear canvas growth and shrink with a receptor-height floor", () => {
  assert.equal(getReceptorCanvasHeight(432, 356, 20), 374)
  assert.equal(getReceptorCanvasHeight(440, 356, 20), 350)
  assert.equal(getReceptorCanvasHeight(600, 356, 80), 80)
})

test("extracts the selected spritesheet frame before rendering", async () => {
  await withImages(async ({ base, source }) => {
    const red = Buffer.from([255, 0, 0, 255])
    const blue = Buffer.from([0, 0, 255, 255])
    const pixels = Buffer.concat(
      Array.from({ length: 10 }, () =>
        Buffer.concat([
          ...Array.from({ length: 10 }, () => red),
          ...Array.from({ length: 10 }, () => blue),
        ]),
      ),
    )
    await sharp(pixels, { raw: { width: 20, height: 10, channels: 4 } })
      .png()
      .toFile(source)

    const output = await renderReceptorImage(
      {
        filePath: source,
        rotation: 0,
        frame: { index: 1, columns: 2, rows: 1 },
      },
      { hitPosition: 438, baseImagePath: base },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
    const centerTop = pixel(data, info.width, 74, 0)

    assert.deepEqual([...centerTop], [0, 0, 255, 255])
    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: 70,
      top: 0,
      right: 79,
      bottom: 9,
    })
  })
})

test("rotates before centering and keeps the receptor anchored at the top", async () => {
  await withImages(async ({ base, source }) => {
    await sharp({
      create: {
        width: 20,
        height: 10,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)

    const output = await renderReceptorImage(
      { filePath: source, rotation: 90 },
      { hitPosition: 438, baseImagePath: base },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: 70,
      top: 0,
      right: 79,
      bottom: 19,
    })
    assert.equal(pixel(data, info.width, 74, 20)[3], 0)
  })
})

test("extracts a non-square frame before applying rotation", async () => {
  await withImages(async ({ base, source }) => {
    await sharp({
      create: {
        width: 40,
        height: 10,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)

    const output = await renderReceptorImage(
      {
        filePath: source,
        rotation: 90,
        frame: { index: 1, columns: 2, rows: 1 },
      },
      { hitPosition: 438, baseImagePath: base },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: 70,
      top: 0,
      right: 79,
      bottom: 19,
    })
  })
})

test("downscales oversized receptors proportionally but never enlarges smaller ones", async () => {
  await withImages(async ({ base, source }) => {
    const definition: ReceptorImage = { filePath: source, rotation: 0 }

    await sharp({
      create: {
        width: 50,
        height: 40,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)
    const small = await renderReceptorImage(definition, {
      hitPosition: 438,
      baseImagePath: base,
    })
    const smallRaw = await sharp(small).raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(alphaBounds(smallRaw.data, smallRaw.info.width, smallRaw.info.height), {
      left: 50,
      top: 0,
      right: 99,
      bottom: 39,
    })

    await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)
    const large = await renderReceptorImage(definition, {
      hitPosition: 438,
      baseImagePath: base,
    })
    const largeRaw = await sharp(large).raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(alphaBounds(largeRaw.data, largeRaw.info.width, largeRaw.info.height), {
      left: 0,
      top: 0,
      right: 149,
      bottom: 49,
    })
  })
})

function pixel(data: Buffer, width: number, x: number, y: number): Buffer {
  const offset = (y * width + x) * 4
  return data.subarray(offset, offset + 4)
}

function alphaBounds(data: Buffer, width: number, height: number) {
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  }

  return { left, top, right, bottom }
}
