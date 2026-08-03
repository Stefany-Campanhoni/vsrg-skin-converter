import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"
import {
  getReceptorBottomPadding,
  getReceptorCanvasHeight,
  renderNoteImage,
  renderReceptorImage,
} from "./sharp-image-processor.ts"

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

test("calculates dynamic receptor footer and canvas height", () => {
  assert.equal(getReceptorBottomPadding(432, 480, 150, 62, 13), 148)
  assert.equal(getReceptorBottomPadding(438, 480, 150, 62, 13), 133)
  assert.equal(getReceptorBottomPadding(432, 480, 150, 68, 13), 135)

  assert.equal(getReceptorCanvasHeight(432, 356, 196, 438, 2, 148), 368)
  assert.equal(getReceptorCanvasHeight(438, 356, 196, 438, 2, 133), 356)
  assert.equal(getReceptorCanvasHeight(438, 100, 300, 438, 2, 148), 448)
})

test("rejects invalid dynamic-footer geometry", () => {
  assert.throws(() => getReceptorBottomPadding(432, 480, 150, 0, 13), /positive/)
  assert.throws(() => getReceptorBottomPadding(481, 480, 150, 62, 13), /between/)
  assert.throws(() => getReceptorBottomPadding(432, 480, 150, 62, Number.NaN), /finite/)
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
      {
        hitPosition: 438,
        referenceHitPosition: 438,
        pixelsPerHitPositionPoint: 2,
        normalizationSize: 150,
        verticalScale: 1,
        logicalCanvasHeight: 480,
        renderedWidth: 62,
        logicalBottomOffset: 13,
        baseImagePath: base,
      },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
    const centerBottom = pixel(data, info.width, 74, 222)

    assert.deepEqual([...centerBottom], [0, 0, 255, 255])
    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: 0,
      top: 73,
      right: 149,
      bottom: 222,
    })
  })
})

test("rotates before centering and keeps the receptor anchored at the hit position", async () => {
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
      {
        hitPosition: 438,
        referenceHitPosition: 438,
        pixelsPerHitPositionPoint: 2,
        normalizationSize: 150,
        verticalScale: 1,
        logicalCanvasHeight: 480,
        renderedWidth: 62,
        logicalBottomOffset: 13,
        baseImagePath: base,
      },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: 0,
      top: 0,
      right: 149,
      bottom: 299,
    })
    assert.equal(pixel(data, info.width, 74, 300)[3], 0)
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
      {
        hitPosition: 438,
        referenceHitPosition: 438,
        pixelsPerHitPositionPoint: 2,
        normalizationSize: 150,
        verticalScale: 1,
        logicalCanvasHeight: 480,
        renderedWidth: 62,
        logicalBottomOffset: 13,
        baseImagePath: base,
      },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: 0,
      top: 0,
      right: 149,
      bottom: 299,
    })
  })
})

test("normalizes receptor width to 150 pixels while preserving its aspect ratio", async () => {
  await withImages(async ({ base, source }) => {
    const definition: ImageAsset = { filePath: source, rotation: 0 }

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
      referenceHitPosition: 438,
      pixelsPerHitPositionPoint: 2,
      normalizationSize: 150,
      verticalScale: 1,
      logicalCanvasHeight: 480,
      renderedWidth: 62,
      logicalBottomOffset: 13,
      baseImagePath: base,
    })
    const smallRaw = await sharp(small).raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(alphaBounds(smallRaw.data, smallRaw.info.width, smallRaw.info.height), {
      left: 0,
      top: 103,
      right: 149,
      bottom: 222,
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
      referenceHitPosition: 438,
      pixelsPerHitPositionPoint: 2,
      normalizationSize: 150,
      verticalScale: 1,
      logicalCanvasHeight: 480,
      renderedWidth: 62,
      logicalBottomOffset: 13,
      baseImagePath: base,
    })
    const largeRaw = await sharp(large).raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(alphaBounds(largeRaw.data, largeRaw.info.width, largeRaw.info.height), {
      left: 0,
      top: 173,
      right: 149,
      bottom: 222,
    })
  })
})

test("keeps a tall receptor within the existing 150 pixel boundary", async () => {
  await withImages(async ({ base, source }) => {
    await sharp({
      create: {
        width: 200,
        height: 400,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)

    const output = await renderReceptorImage(
      { filePath: source, rotation: 0 },
      {
        hitPosition: 438,
        referenceHitPosition: 438,
        pixelsPerHitPositionPoint: 2,
        normalizationSize: 150,
        verticalScale: 1,
        logicalCanvasHeight: 480,
        renderedWidth: 62,
        logicalBottomOffset: 13,
        baseImagePath: base,
      },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: 37,
      top: 73,
      right: 111,
      bottom: 222,
    })
  })
})

test("stretches the visible receptor and aligns its bottom edge with the canvas", async () => {
  await withImages(async ({ base, source }) => {
    const visibleLayer = await sharp({
      create: {
        width: 146,
        height: 146,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
    await sharp({
      create: {
        width: 150,
        height: 150,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: visibleLayer, left: 2, top: 0 }])
      .png()
      .toFile(source)

    const output = await renderReceptorImage(
      { filePath: source, rotation: 0 },
      {
        hitPosition: 432,
        referenceHitPosition: 438,
        pixelsPerHitPositionPoint: 2,
        normalizationSize: 150,
        verticalScale: 196 / 146,
        logicalCanvasHeight: 480,
        renderedWidth: 62,
        logicalBottomOffset: 13,
        baseImagePath: base,
      },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    assert.deepEqual({ width: info.width, height: info.height }, { width: 150, height: 368 })
    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: 2,
      top: 24,
      right: 147,
      bottom: 219,
    })
  })
})

test("keeps the visible receptor bottom at the logical hit position across widths", async () => {
  await withImages(async ({ base, source }) => {
    const visibleLayer = await sharp({
      create: {
        width: 146,
        height: 146,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
    await sharp({
      create: {
        width: 150,
        height: 150,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: visibleLayer, left: 2, top: 0 }])
      .png()
      .toFile(source)

    const definition: ImageAsset = { filePath: source, rotation: 0 }
    const cases = [
      { renderedWidth: 46, verticalScale: 1 },
      { renderedWidth: 62, verticalScale: 196 / 146 },
    ]

    for (const { renderedWidth, verticalScale } of cases) {
      const output = await renderReceptorImage(definition, {
        hitPosition: 432,
        referenceHitPosition: 438,
        pixelsPerHitPositionPoint: 2,
        normalizationSize: 150,
        verticalScale,
        logicalCanvasHeight: 480,
        renderedWidth,
        logicalBottomOffset: 13,
        baseImagePath: base,
      })
      const raw = await sharp(output).raw().toBuffer({ resolveWithObject: true })
      const bounds = alphaBounds(raw.data, raw.info.width, raw.info.height)
      const footer = raw.info.height - bounds.bottom - 1
      const logicalVisibleBottom = 480 - (footer * renderedWidth) / raw.info.width

      assert.ok(Math.abs(logicalVisibleBottom - (432 - 13)) < 0.2)
    }
  })
})

test("preserves a receptor without visible pixels", async () => {
  await withImages(async ({ base, source }) => {
    await sharp({
      create: {
        width: 20,
        height: 10,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(source)

    const output = await renderReceptorImage(
      { filePath: source, rotation: 0 },
      {
        hitPosition: 438,
        referenceHitPosition: 438,
        pixelsPerHitPositionPoint: 2,
        normalizationSize: 150,
        verticalScale: 1,
        logicalCanvasHeight: 480,
        renderedWidth: 62,
        logicalBottomOffset: 13,
        baseImagePath: base,
      },
    )
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    assert.deepEqual(alphaBounds(data, info.width, info.height), {
      left: info.width,
      top: info.height,
      right: -1,
      bottom: -1,
    })
  })
})

test("extracts a note frame without resizing or adding canvas", async () => {
  await withImages(async ({ source }) => {
    const red = Buffer.from([255, 0, 0, 255])
    const blue = Buffer.from([0, 0, 255, 255])
    const pixels = Buffer.concat(
      Array.from({ length: 12 }, (_, y) =>
        Buffer.concat(Array.from({ length: 18 }, () => (y < 6 ? red : blue))),
      ),
    )
    await sharp(pixels, { raw: { width: 18, height: 12, channels: 4 } })
      .png()
      .toFile(source)

    const definition: ImageAsset = {
      filePath: source,
      rotation: 0,
      frame: { index: 1, columns: 1, rows: 2 },
    }
    const output = await renderNoteImage(definition)
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })

    assert.deepEqual({ width: info.width, height: info.height }, { width: 18, height: 6 })
    assert.deepEqual([...pixel(data, info.width, 0, 0)], [0, 0, 255, 255])
  })
})

test("rotates a selected non-square note frame while preserving its dimensions", async () => {
  await withImages(async ({ source }) => {
    await sharp({
      create: {
        width: 24,
        height: 10,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)

    const output = await renderNoteImage({
      filePath: source,
      rotation: 90,
      frame: { index: 1, columns: 2, rows: 1 },
    })
    const metadata = await sharp(output).metadata()

    assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 10, height: 12 })
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
