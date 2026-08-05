import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"
import { renderJudgementImageVariants } from "./sharp-judgement-processor.ts"

async function writeTwoColumnSheet(
  filePath: string,
  frameWidth: number,
  frameHeight: number,
): Promise<ImageAsset> {
  const width = frameWidth * 2
  const data = Buffer.alloc(width * frameHeight * 4)
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const isSelectedFrame = x < frameWidth
      data[offset] = isSelectedFrame ? 255 : 0
      data[offset + 1] = 0
      data[offset + 2] = isSelectedFrame ? 0 : 255
      data[offset + 3] = isSelectedFrame && x === 0 && y === 0 ? 0 : 255
    }
  }
  await sharp(data, { raw: { width, height: frameHeight, channels: 4 } })
    .png()
    .toFile(filePath)
  return {
    filePath,
    rotation: 0,
    frame: { index: 0, columns: 2, rows: 1 },
  }
}

async function dimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer).metadata()
  assert.ok(metadata.width)
  assert.ok(metadata.height)
  return { width: metadata.width, height: metadata.height }
}

async function alphaAt(buffer: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  const alpha = data[(y * info.width + x) * 4 + 3]
  assert.ok(alpha !== undefined)
  return alpha
}

test("renders scaled standard-density judgement images at SD and HD sizes", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-"))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const asset = await writeTwoColumnSheet(path.join(directory, "standard.png"), 6, 4)
  const variants = await renderJudgementImageVariants(asset, 1, 0.675)

  assert.deepEqual(await dimensions(variants.standardResolution), { width: 4, height: 3 })
  assert.deepEqual(await dimensions(variants.doubleResolution), { width: 8, height: 5 })
})

test("renders scaled double-density judgement images with rounded dimensions", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-"))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const asset = await writeTwoColumnSheet(path.join(directory, "double.png"), 9, 7)
  const variants = await renderJudgementImageVariants(asset, 2, 0.675)

  assert.deepEqual(await dimensions(variants.standardResolution), { width: 3, height: 2 })
  assert.deepEqual(await dimensions(variants.doubleResolution), { width: 6, height: 5 })
})

test("preserves unscaled standard-density judgement output", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-"))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const asset = await writeTwoColumnSheet(path.join(directory, "standard.png"), 6, 4)
  const variants = await renderJudgementImageVariants(asset, 1, 1)

  assert.deepEqual(await dimensions(variants.standardResolution), { width: 6, height: 4 })
  assert.deepEqual(await dimensions(variants.doubleResolution), { width: 12, height: 8 })
  assert.equal(await alphaAt(variants.standardResolution, 0, 0), 0)
})
