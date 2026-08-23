import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import type { ImageAsset, TapNoteSet } from "../../../domain/image.ts"
import { writeEtternaNotes } from "./write-etterna-notes.ts"

test("scales tap notes proportionally to 150px high under their fixed Etterna output names", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-notes-"))
  const outputDirectory = path.join(root, "output")
  const fixtures = {
    left: {
      outputFilename: "_Left Tap Note (res 64x64).png",
      width: 20,
      height: 10,
      outputWidth: 300,
      color: { r: 230, g: 15, b: 35, alpha: 1 },
      density: "standard",
    },
    down: {
      outputFilename: "_Down Tap Note (res 64x64).png",
      width: 30,
      height: 25,
      outputWidth: 180,
      color: { r: 20, g: 195, b: 75, alpha: 1 },
      density: "double",
    },
    up: {
      outputFilename: "_Up Tap Note (res 64x64).png",
      width: 42,
      height: 150,
      outputWidth: 42,
      color: { r: 40, g: 70, b: 225, alpha: 1 },
    },
    right: {
      outputFilename: "_Right Tap Note (res 64x64).png",
      width: 12,
      height: 20,
      outputWidth: 90,
      color: { r: 245, g: 180, b: 10, alpha: 1 },
      density: "double",
    },
  } satisfies Record<
    string,
    {
      width: number
      height: number
      outputWidth: number
      outputFilename: string
      color: { r: number; g: number; b: number; alpha: number }
      density?: "standard" | "double"
    }
  >
  try {
    await mkdir(outputDirectory)
    for (const [direction, fixture] of Object.entries(fixtures)) {
      await writeFile(
        path.join(root, `${direction}.png`),
        await solidPng(fixture.width, fixture.height, fixture.color),
      )
    }

    await writeEtternaNotes({
      notes: {
        left: asset(path.join(root, "left.png"), fixtures.left.density),
        down: asset(path.join(root, "down.png"), fixtures.down.density),
        up: asset(path.join(root, "up.png")),
        right: asset(path.join(root, "right.png"), fixtures.right.density),
      },
      outputDirectory,
    })

    const notesDirectory = path.join(outputDirectory, "Notes")
    assert.deepEqual((await readdir(notesDirectory)).sort(), [
      "_Down Tap Note (res 64x64).png",
      "_Left Tap Note (res 64x64).png",
      "_Right Tap Note (res 64x64).png",
      "_Up Tap Note (res 64x64).png",
    ])
    for (const fixture of Object.values(fixtures)) {
      const outputPath = path.join(notesDirectory, fixture.outputFilename)
      const metadata = await sharp(outputPath).metadata()
      assert.deepEqual(
        { width: metadata.width, height: metadata.height },
        { width: fixture.outputWidth, height: 150 },
      )
      const { data } = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true })
      assert.deepEqual(
        [...data.subarray(0, 4)],
        [fixture.color.r, fixture.color.g, fixture.color.b, 255],
      )
    }
    assert.deepEqual(
      await readFile(path.join(notesDirectory, fixtures.up.outputFilename)),
      await readFile(path.join(root, "up.png")),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("settles every tap-note resize before failing and does not start the write phase", async () => {
  const sibling = deferred<Buffer>()
  const resizesStarted = deferred<void>()
  const failure = new Error("exact note resize failure")
  const writes: string[] = []
  let calls = 0
  const writing = writeEtternaNotes({
    notes: completeNotes("standard"),
    outputDirectory: "output",
    read: async (filePath) => Buffer.from(filePath),
    resize: async () => {
      calls += 1
      if (calls === 4) {
        resizesStarted.resolve()
      }
      if (calls === 1) {
        return sibling.promise
      }
      if (calls === 2) {
        throw failure
      }
      return Buffer.from("resized png")
    },
    write: async (filePath) => {
      writes.push(filePath)
    },
  })
  let settled = false
  void writing.catch(() => {
    settled = true
  })

  const phase = await Promise.race([
    resizesStarted.promise.then(() => "resizes started"),
    writing.then(
      () => "completed",
      () => "rejected",
    ),
  ])
  assert.equal(phase, "resizes started")
  assert.equal(calls, 4)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(settled, false)

  sibling.resolve(Buffer.from("resized png"))
  await assert.rejects(writing, (error) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /resize.*tap note.*down.*down\.png.*height 150/i)
    assert.equal(error.cause, failure)
    return true
  })
  assert.deepEqual(writes, [])
})

test("settles every tap-note read before failing and does not start the write phase", async () => {
  const sibling = deferred<Buffer>()
  const failureStarted = deferred<void>()
  const failure = new Error("exact note read failure")
  const writes: string[] = []
  let calls = 0
  const writing = writeEtternaNotes({
    notes: completeNotes("standard"),
    outputDirectory: "output",
    read: async () => {
      calls += 1
      if (calls === 1) {
        return sibling.promise
      }
      if (calls === 2) {
        failureStarted.resolve()
        throw failure
      }
      return Buffer.from("png")
    },
    write: async (filePath) => {
      writes.push(filePath)
    },
  })
  let settled = false
  void writing.catch(() => {
    settled = true
  })

  await failureStarted.promise
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(settled, false)

  sibling.resolve(Buffer.from("png"))
  await assert.rejects(writing, (error) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /read.*tap note.*down.*down\.png/i)
    assert.equal(error.cause, failure)
    return true
  })
  assert.deepEqual(writes, [])
})

test("starts and settles every tap-note write when a writer throws synchronously", async () => {
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact synchronous note write failure")
  let calls = 0
  const writing = writeEtternaNotes({
    notes: completeNotes("standard"),
    outputDirectory: "output",
    read: async () => Buffer.from("png"),
    resize: async (buffer) => buffer,
    write: () => {
      calls += 1
      if (calls === 4) {
        writesStarted.resolve()
      }
      if (calls === 1) {
        return sibling.promise
      }
      if (calls === 2) {
        throw failure
      }
      return Promise.resolve()
    },
  })

  const phase = await Promise.race([
    writesStarted.promise.then(() => "started"),
    writing.then(
      () => "completed",
      () => "rejected",
    ),
  ])
  assert.equal(phase, "started")
  assert.equal(calls, 4)
  let settled = false
  void writing.catch(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)

  sibling.resolve()
  await assert.rejects(writing, (error) => {
    assert.ok(error instanceof Error)
    assert.match(
      error.message,
      /write generated Etterna asset.*_Down Tap Note \(res 64x64\)\.png.*output.*Notes/i,
    )
    assert.equal(error.cause, failure)
    return true
  })
})

function completeNotes(pixelDensity: "standard" | "double"): TapNoteSet {
  return {
    left: asset("left.png", pixelDensity),
    down: asset("down.png", pixelDensity),
    up: asset("up.png", pixelDensity),
    right: asset("right.png", pixelDensity),
  }
}

function asset(filePath: string, pixelDensity?: "standard" | "double"): ImageAsset {
  return pixelDensity ? { filePath, rotation: 0, pixelDensity } : { filePath, rotation: 0 }
}

async function solidPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number; alpha: number },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer()
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
