import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import type { ImageAsset, TapNoteSet } from "../../../domain/image.ts"
import { writeOsuNotes } from "./write-osu-notes.ts"

const image: ImageAsset = { filePath: "source.png", rotation: 0 }
const notes: TapNoteSet = {
  left: image,
  down: image,
  up: image,
  right: image,
}

test("writes every note using the names referenced by the osu template", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-note-writer-"))
  try {
    await writeOsuNotes({
      notes,
      outputDirectory,
      render: async () => Buffer.from("png"),
    })

    const names = await readdir(path.join(outputDirectory, "mania", "notes"))
    assert.deepEqual(names.sort(), ["down.png", "left.png", "right.png", "up.png"])
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("does not create note output when any render fails", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-note-writer-"))
  let calls = 0
  try {
    await assert.rejects(
      () =>
        writeOsuNotes({
          notes,
          outputDirectory,
          render: async () => {
            calls += 1
            if (calls === 3) {
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
