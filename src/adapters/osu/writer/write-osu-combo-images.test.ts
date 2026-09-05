import { expect, onTestFinished, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { expectRejectionSatisfies } from "../../../../tests/support/expectations.ts"
import { writeOsuComboImages } from "./write-osu-combo-images.ts"

test("resizes every copied osu combo image with rounded proportional dimensions", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-combo-writer-"))
  onTestFinished(() => rm(outputDirectory, { recursive: true, force: true }))

  const expectedFilenames: string[] = []
  for (const character of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "comma", "dot"]) {
    for (const [suffix, dimensions] of [
      [".png", { width: 10, height: 6 }],
      ["@2x.png", { width: 20, height: 12 }],
    ] as const) {
      const filename = `combo-${character}${suffix}`
      expectedFilenames.push(filename)
      await sharp({
        create: {
          ...dimensions,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toFile(path.join(outputDirectory, filename))
    }
  }

  await writeOsuComboImages({ outputDirectory, scale: 0.6 })

  expect((await readdir(outputDirectory)).sort()).toStrictEqual(expectedFilenames.sort())
  for (const character of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "comma", "dot"]) {
    const standard = await sharp(path.join(outputDirectory, `combo-${character}.png`)).metadata()
    expect({ width: standard.width, height: standard.height }).toStrictEqual({
      width: 6,
      height: 4,
    })
    const double = await sharp(path.join(outputDirectory, `combo-${character}@2x.png`)).metadata()
    expect({ width: double.width, height: double.height }).toStrictEqual({ width: 12, height: 7 })
  }
})

test("finishes every resize and writes nothing when combo preparation fails", async () => {
  const sibling = deferred<Buffer>()
  const preparationsStarted = deferred<void>()
  const failure = new Error("exact combo resize failure")
  let resizeCalls = 0
  let writeCalls = 0

  const writing = writeOsuComboImages({
    outputDirectory: "workspace",
    scale: 0.6,
    read: async (filePath) => Buffer.from(filePath),
    resize: async (image) => {
      resizeCalls += 1
      if (resizeCalls === 24) {
        preparationsStarted.resolve()
      }
      if (resizeCalls === 1) {
        return sibling.promise
      }
      if (resizeCalls === 2) {
        throw failure
      }
      return image
    },
    write: async () => {
      writeCalls += 1
    },
  })

  const preparationPhase = await Promise.race([
    preparationsStarted.promise.then(() => "started"),
    writing.then(
      () => "completed",
      () => "rejected",
    ),
  ])
  expect(preparationPhase).toBe("started")
  let settled = false
  void writing.catch(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  expect(writeCalls).toBe(0)

  sibling.resolve(Buffer.from("resized"))
  await expectRejectionSatisfies(
    writing,
    (error) =>
      error instanceof Error && error.cause === failure && /combo-0@2x\.png/.test(error.message),
  )
  expect(writeCalls).toBe(0)
})

test("starts every combo write and waits for siblings when a writer throws synchronously", async () => {
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact synchronous combo write failure")
  let writeCalls = 0

  const writing = writeOsuComboImages({
    outputDirectory: "workspace",
    scale: 1,
    read: async (filePath) => Buffer.from(filePath),
    resize: async (image) => image,
    write: () => {
      writeCalls += 1
      if (writeCalls === 24) {
        writesStarted.resolve()
      }
      if (writeCalls === 1) {
        return sibling.promise
      }
      if (writeCalls === 2) {
        throw failure
      }
      return Promise.resolve()
    },
  })

  const writePhase = await Promise.race([
    writesStarted.promise.then(() => "started"),
    writing.then(
      () => "completed",
      () => "rejected",
    ),
  ])
  expect(writePhase).toBe("started")
  expect(writeCalls).toBe(24)
  let settled = false
  void writing.catch(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)

  sibling.resolve()
  await expectRejectionSatisfies(
    writing,
    (error) =>
      error instanceof Error && error.cause === failure && /combo-0@2x\.png/.test(error.message),
  )
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
