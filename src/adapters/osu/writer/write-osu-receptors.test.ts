import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
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
const visiblePng = await createPng({ r: 255, g: 0, b: 0, alpha: 1 })
const transparentPng = await createPng({ r: 0, g: 0, b: 0, alpha: 0 })

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
        return visiblePng
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
    assert.ok(receivedOptions.every((options) => options.normalizationSize === 150))
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("uses the normal receptor when the pressed receptor is transparent", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  const normal: ImageAsset = { filePath: "normal.png", rotation: 0 }
  const transparentPressed: ImageAsset = { filePath: "pressed.png", rotation: 0 }
  const pressedReceptors: ReceptorSet = {
    left: { normal, pressed: transparentPressed },
    down: { normal, pressed: normal },
    up: { normal, pressed: normal },
    right: { normal, pressed: normal },
  }
  try {
    await writeOsuReceptors({
      receptors: pressedReceptors,
      outputDirectory,
      hitPosition: 438,
      columnWidth: 62,
      baseImagePath: "base.png",
      render: async (definition) =>
        definition.filePath === transparentPressed.filePath ? transparentPng : visiblePng,
    })

    const receptorDirectory = path.join(outputDirectory, "mania", "receptors")
    assert.deepEqual(
      await readFile(path.join(receptorDirectory, "left_tap@2x.png")),
      await readFile(path.join(receptorDirectory, "left@2x.png")),
    )
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("preserves a transparent normal receptor when the pressed receptor is visible", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  const transparentNormal: ImageAsset = { filePath: "transparent-normal.png", rotation: 0 }
  const visiblePressed: ImageAsset = { filePath: "visible-pressed.png", rotation: 0 }
  const mixedReceptors: ReceptorSet = {
    left: { normal: transparentNormal, pressed: visiblePressed },
    down: { normal: image, pressed: image },
    up: { normal: image, pressed: image },
    right: { normal: image, pressed: image },
  }

  try {
    await writeOsuReceptors({
      receptors: mixedReceptors,
      outputDirectory,
      hitPosition: 438,
      columnWidth: 62,
      baseImagePath: "base.png",
      render: async (definition) =>
        definition.filePath === transparentNormal.filePath ? transparentPng : visiblePng,
    })

    const receptorDirectory = path.join(outputDirectory, "mania", "receptors")
    assert.deepEqual(await readFile(path.join(receptorDirectory, "left@2x.png")), transparentPng)
    assert.deepEqual(await readFile(path.join(receptorDirectory, "left_tap@2x.png")), visiblePng)
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
            return visiblePng
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
        return visiblePng
      },
      inspectTransparency: async () => false,
    })
    let settled = false
    void writing.catch(() => {
      settled = true
    })

    await failureStarted.promise
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(settled, false)

    sibling.resolve(visiblePng)
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
      render: async () => visiblePng,
      inspectTransparency: async () => false,
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

test("starts every receptor write and waits for siblings when a writer throws synchronously", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact synchronous write failure")
  let calls = 0

  try {
    const writing = writeOsuReceptors({
      receptors,
      outputDirectory,
      hitPosition: 438,
      columnWidth: 62,
      baseImagePath: "base.png",
      render: async () => visiblePng,
      inspectTransparency: async () => false,
      write: () => {
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
    assert.equal(calls, 8)

    let settled = false
    void writing.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.resolve()
    assert.equal(settled, false)

    sibling.resolve()
    await assert.rejects(writing, (error) => error === failure)
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("adds receptor context when transparency inspection fails", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-writer-"))
  const failure = new Error("invalid image data")

  try {
    await assert.rejects(
      () =>
        writeOsuReceptors({
          receptors,
          outputDirectory,
          hitPosition: 438,
          columnWidth: 62,
          baseImagePath: "base.png",
          render: async () => visiblePng,
          inspectTransparency: async () => {
            throw failure
          },
        }),
      (error) =>
        error instanceof Error &&
        error.message === "Could not inspect pressed receptor for left" &&
        error.cause === failure,
    )

    assert.deepEqual(await readdir(outputDirectory), [])
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

function createPng(background: { r: number; g: number; b: number; alpha: number }) {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background,
    },
  })
    .png()
    .toBuffer()
}
