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
      columnWidth: 62,
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
    assert.ok(receivedOptions.every((options) => options.verticalScale === 196 / 146))
    assert.ok(receivedOptions.every((options) => options.logicalCanvasHeight === 480))
    assert.ok(receivedOptions.every((options) => options.renderedWidth === 62))
    assert.ok(receivedOptions.every((options) => options.logicalBottomOffset === 23))
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
          columnWidth: 62,
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

test("waits for every receptor render before rethrowing the exact render failure", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  const sibling = deferred<Buffer>()
  const failureStarted = deferred<void>()
  const failure = new Error("exact render failure")
  let calls = 0
  try {
    const writing = writeOsuReceptors({
      receptors,
      outputDirectory,
      hitPosition: 438,
      columnWidth: 62,
      baseImagePath: "base.png",
      render: async () => {
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
    })
    let settled = false
    void writing.catch(() => {
      settled = true
    })

    await failureStarted.promise
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(settled, false)

    sibling.resolve(Buffer.from("png"))
    await assert.rejects(writing, (error) => error === failure)
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("waits for every receptor write before rethrowing the exact write failure", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact write failure")
  let calls = 0
  try {
    const writing = writeOsuReceptors({
      receptors,
      outputDirectory,
      hitPosition: 438,
      columnWidth: 62,
      baseImagePath: "base.png",
      render: async () => Buffer.from("png"),
      write: async () => {
        calls += 1
        if (calls === 8) {
          writesStarted.resolve()
        }
        if (calls === 1) {
          return sibling.promise
        }
        if (calls === 2) {
          throw failure
        }
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

    let settled = false
    void writing.catch(() => {
      settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)

    sibling.resolve()
    await assert.rejects(writing, (error) => error === failure)
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

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
