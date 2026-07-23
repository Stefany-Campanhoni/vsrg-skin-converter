import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import type { ImageAsset, ReceptorSet } from "../../../domain/image.ts"
import type { RenderReceptorOptions } from "../../../infrastructure/image/sharp-image-processor.ts"
import { writeOsuReceptors } from "./write-osu-receptors.ts"

const image: ImageAsset = { filePath: "source.png", rotation: 0 }
const receptors: ReceptorSet = {
  left: { normal: image, pressed: image },
  down: { normal: image, pressed: image },
  up: { normal: image, pressed: image },
  right: { normal: image, pressed: image },
}

test("writes every receptor using the names referenced by the osu template", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  const receivedOptions: RenderReceptorOptions[] = []
  try {
    await writeOsuReceptors({
      receptors,
      outputDirectory,
      hitPosition: 438,
      baseImagePath: "base.png",
      render: async (_definition, options) => {
        receivedOptions.push(options)
        return Buffer.from("png")
      },
    })

    const names = await readdir(path.join(outputDirectory, "mania", "receptors"))
    assert.deepEqual(names.sort(), [
      "down@2x.png",
      "down_tap@2x.png",
      "left@2x.png",
      "left_tap@2x.png",
      "right@2x.png",
      "right_tap@2x.png",
      "up@2x.png",
      "up_tap@2x.png",
    ])
    assert.equal(receivedOptions.length, 8)
    assert.ok(receivedOptions.every((options) => options.pixelsPerHitPositionPoint === 2))
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("does not create receptor output when any render fails", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  let calls = 0
  try {
    await assert.rejects(
      () =>
        writeOsuReceptors({
          receptors,
          outputDirectory,
          hitPosition: 438,
          baseImagePath: "base.png",
          render: async () => {
            calls += 1
            if (calls === 4) {
              throw new Error("render failed")
            }
            return Buffer.from("png")
          },
        }),
      /render failed/,
    )

    assert.deepEqual(await readdir(outputDirectory), [])
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})
