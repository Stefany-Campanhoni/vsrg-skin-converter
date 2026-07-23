import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import type { ReceptorImage, ReceptorSet } from "../receptor.ts"
import { writeOsuReceptors } from "./write-receptors.ts"

const image: ReceptorImage = { filePath: "source.png", rotation: 0 }
const receptors: ReceptorSet = {
  left: { normal: image, pressed: image },
  down: { normal: image, pressed: image },
  up: { normal: image, pressed: image },
  right: { normal: image, pressed: image },
}

test("writes every receptor using the names referenced by the osu template", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  try {
    await writeOsuReceptors({
      receptors,
      outputDirectory,
      hitPosition: 438,
      baseImagePath: "base.png",
      render: async () => Buffer.from("png"),
    })

    const names = await readdir(path.join(outputDirectory, "mania", "receptors"))
    assert.deepEqual(names.sort(), [
      "down.png",
      "down_tap.png",
      "left.png",
      "left_tap.png",
      "right.png",
      "right_tap.png",
      "up.png",
      "up_tap.png",
    ])
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
