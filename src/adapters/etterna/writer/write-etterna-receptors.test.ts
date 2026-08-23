import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import type { ImageAsset, ImageDensity, ReceptorSet } from "../../../domain/image.ts"
import { isImageFullyTransparent } from "../../../infrastructure/image/is-image-fully-transparent.ts"
import { writeEtternaReceptors } from "./write-etterna-receptors.ts"

test("trims receptors before scaling them proportionally to 146px high", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-receptors-"))
  const outputDirectory = path.join(root, "output")
  try {
    await mkdir(outputDirectory)
    const { receptors, colors } = await writeVisibleReceptorFixtures(root)

    await writeEtternaReceptors({ receptors, outputDirectory })

    const receptorDirectory = path.join(outputDirectory, "Receptors")
    assert.deepEqual((await readdir(receptorDirectory)).sort(), [
      "pressed Down (res 64x64).png",
      "pressed Left (res 64x64).png",
      "pressed Right (res 64x64).png",
      "pressed Up (res 64x64).png",
      "release Down (res 64x64).png",
      "release Left (res 64x64).png",
      "release Right (res 64x64).png",
      "release Up (res 64x64).png",
    ])
    for (const filename of await readdir(receptorDirectory)) {
      const output = await readFile(path.join(receptorDirectory, filename))
      assert.deepEqual(await imageSize(output), { width: 183, height: 146 }, filename)
      assert.equal(await alphaAt(output, 0, 73), 0, `${filename} keeps its left margin transparent`)
      assert.equal(
        await alphaAt(output, 182, 73),
        0,
        `${filename} keeps its right margin transparent`,
      )
      const color = colors[filename]
      assert.ok(color, `${filename} has a fixture color`)
      assert.equal(await containsRgba(output, color), true, `${filename} keeps its own color`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("scales a fully transparent normal receptor proportionally to 146px high", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-receptors-"))
  const outputDirectory = path.join(root, "output")
  const transparent = await png(7, 11, { r: 0, g: 0, b: 0, alpha: 0 })
  try {
    await mkdir(outputDirectory)
    const { receptors } = await writeVisibleReceptorFixtures(root)
    const filePath = path.join(root, "transparent-normal.png")
    await writeFile(filePath, transparent)
    receptors.up.normal = asset(filePath, "double")

    await writeEtternaReceptors({ receptors, outputDirectory })

    const normal = await readFile(
      path.join(outputDirectory, "Receptors", "release Up (res 64x64).png"),
    )
    assert.deepEqual(await imageSize(normal), { width: 93, height: 146 })
    assert.equal(await isImageFullyTransparent(normal), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("uses the processed normal when pressed is fully transparent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-receptors-"))
  const outputDirectory = path.join(root, "output")
  const transparent = await png(5, 9, { r: 0, g: 0, b: 0, alpha: 0 })
  try {
    await mkdir(outputDirectory)
    const { receptors } = await writeVisibleReceptorFixtures(root)
    const filePath = path.join(root, "transparent-pressed.png")
    await writeFile(filePath, transparent)
    receptors.left.normal.pixelDensity = "standard"
    receptors.left.pressed = asset(filePath, "double")

    await writeEtternaReceptors({ receptors, outputDirectory })

    const receptorDirectory = path.join(outputDirectory, "Receptors")
    const normal = await readFile(path.join(receptorDirectory, "release Left (res 64x64).png"))
    const pressed = await readFile(path.join(receptorDirectory, "pressed Left (res 64x64).png"))
    assert.deepEqual(await imageSize(normal), { width: 183, height: 146 })
    assert.deepEqual(await imageSize(pressed), { width: 183, height: 146 })
    assert.deepEqual(pressed, normal)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("reports receptor source read failures with direction, state, path, and exact cause", async () => {
  const failure = new Error("exact pressed receptor read failure")

  await assert.rejects(
    () =>
      writeEtternaReceptors({
        receptors: inMemoryReceptors(),
        outputDirectory: "output",
        read: async (filePath) => {
          if (filePath === "left-pressed.png") {
            throw failure
          }
          return Buffer.from(filePath)
        },
        inspectTransparency: async () => false,
        normalize: async (buffer) => buffer,
        write: async () => {},
      }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /read.*pressed receptor.*left.*left-pressed\.png/i)
      assert.equal(error.cause, failure)
      return true
    },
  )
})

test("settles sibling transparency inspections before reporting contextual exact cause", async () => {
  const sibling = deferred<boolean>()
  const failureStarted = deferred<void>()
  const failure = new Error("exact transparency inspection failure")
  let inspectionCalls = 0
  const writing = writeEtternaReceptors({
    receptors: inMemoryReceptors(),
    outputDirectory: "output",
    read: async (filePath) => Buffer.from(filePath),
    inspectTransparency: () => {
      inspectionCalls += 1
      if (inspectionCalls === 1) {
        return sibling.promise
      }
      if (inspectionCalls === 2) {
        failureStarted.resolve()
        throw failure
      }
      return Promise.resolve(false)
    },
    normalize: async (buffer) => buffer,
    write: async () => {},
  })
  let settled = false
  void writing.catch(() => {
    settled = true
  })

  await failureStarted.promise
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(inspectionCalls, 8)
  assert.equal(settled, false)

  sibling.resolve(false)
  await assert.rejects(writing, (error) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /inspect transparency.*pressed receptor.*left.*left-pressed\.png/i)
    assert.equal(error.cause, failure)
    return true
  })
})

test("settles sibling receptor processing after a decode failure before rejecting without writes", async () => {
  const sibling = deferred<Buffer>()
  const failureStarted = deferred<void>()
  const decodeFailure = new Error("exact decode failure")
  const writes: string[] = []
  let normalizeCalls = 0
  const writing = writeEtternaReceptors({
    receptors: inMemoryReceptors(),
    outputDirectory: "output",
    read: async (filePath) => Buffer.from(filePath),
    inspectTransparency: async () => false,
    normalize: async () => {
      normalizeCalls += 1
      if (normalizeCalls === 1) {
        return sibling.promise
      }
      if (normalizeCalls === 2) {
        failureStarted.resolve()
        throw decodeFailure
      }
      return Buffer.from("normalized")
    },
    resize: async (buffer) => buffer,
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
  assert.equal(normalizeCalls, 8)

  sibling.resolve(Buffer.from("normalized"))
  await assert.rejects(writing, (error) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /normalize.*pressed receptor.*left.*left-pressed\.png/i)
    assert.equal(error.cause, decodeFailure)
    return true
  })
  assert.deepEqual(writes, [])
})

test("settles final resizes before reporting their contextual exact cause without writes", async () => {
  const sibling = deferred<Buffer>()
  const failureStarted = deferred<void>()
  const resizeFailure = new Error("exact final resize failure")
  const writes: string[] = []
  let resizeCalls = 0
  const writing = writeEtternaReceptors({
    receptors: inMemoryReceptors(),
    outputDirectory: "output",
    read: async (filePath) => Buffer.from(filePath),
    inspectTransparency: async () => false,
    normalize: async (buffer) => buffer,
    resize: () => {
      resizeCalls += 1
      if (resizeCalls === 1) {
        return sibling.promise
      }
      if (resizeCalls === 2) {
        failureStarted.resolve()
        throw resizeFailure
      }
      return Promise.resolve(Buffer.from("resized"))
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
  assert.equal(resizeCalls, 8)
  assert.equal(settled, false)

  sibling.resolve(Buffer.from("resized"))
  await assert.rejects(writing, (error) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /resize.*pressed receptor.*left.*left-pressed\.png.*height 146/i)
    assert.equal(error.cause, resizeFailure)
    return true
  })
  assert.deepEqual(writes, [])
})

test("starts and settles every receptor write when a writer throws synchronously", async () => {
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact synchronous receptor write failure")
  let calls = 0
  const writing = writeEtternaReceptors({
    receptors: inMemoryReceptors(),
    outputDirectory: "output",
    read: async (filePath) => Buffer.from(filePath),
    inspectTransparency: async () => false,
    normalize: async () => Buffer.from("normalized"),
    resize: async (buffer) => buffer,
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
      /write generated Etterna asset.*pressed Left \(res 64x64\)\.png.*output.*Receptors/i,
    )
    assert.equal(error.cause, failure)
    return true
  })
})

async function writeVisibleReceptorFixtures(root: string): Promise<{
  receptors: ReceptorSet
  colors: Readonly<Record<string, Rgba>>
}> {
  const definitions = inMemoryReceptors()
  const colors: Record<string, Rgba> = {}
  let index = 0
  for (const direction of ["left", "down", "up", "right"] as const) {
    for (const state of ["normal", "pressed"] as const) {
      index += 1
      const filePath = path.join(root, `${direction}-${state}.png`)
      const color = {
        r: index * 20,
        g: 255 - index * 20,
        b: index * 10,
        alpha: 255,
      }
      await writeFile(filePath, await receptorPng(color))
      definitions[direction][state].filePath = filePath
      colors[
        `${state === "normal" ? "release" : "pressed"} ${titleCase(direction)} (res 64x64).png`
      ] = color
    }
  }
  return { receptors: definitions, colors }
}

function inMemoryReceptors(): ReceptorSet {
  return {
    left: {
      normal: asset("left-normal.png", "standard"),
      pressed: asset("left-pressed.png", "double"),
    },
    down: {
      normal: asset("down-normal.png", "double"),
      pressed: asset("down-pressed.png", "standard"),
    },
    up: {
      normal: asset("up-normal.png", "standard"),
      pressed: asset("up-pressed.png"),
    },
    right: {
      normal: asset("right-normal.png", "double"),
      pressed: asset("right-pressed.png", "double"),
    },
  }
}

function asset(filePath: string, pixelDensity?: ImageDensity): ImageAsset {
  return pixelDensity ? { filePath, rotation: 0, pixelDensity } : { filePath, rotation: 0 }
}

function png(
  width: number,
  height: number,
  background: { r: number; g: number; b: number; alpha: number },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer()
}

type Rgba = { r: number; g: number; b: number; alpha: number }

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase()}${value.slice(1)}`
}

async function receptorPng(color: Rgba): Promise<Buffer> {
  const width = 10
  const height = 16
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 4; y < 12; y += 1) {
    for (let x = 2; x < 8; x += 1) {
      pixels.set([color.r, color.g, color.b, color.alpha], (y * width + x) * 4)
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}

async function imageSize(image: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(image).metadata()
  assert.ok(metadata.width)
  assert.ok(metadata.height)
  return { width: metadata.width, height: metadata.height }
}

async function alphaAt(image: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return data[(y * info.width + x) * info.channels + 3] ?? -1
}

async function containsRgba(image: Buffer, color: Rgba): Promise<boolean> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (
      data[offset] === color.r &&
      data[offset + 1] === color.g &&
      data[offset + 2] === color.b &&
      data[offset + 3] === color.alpha
    ) {
      return true
    }
  }
  return false
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
