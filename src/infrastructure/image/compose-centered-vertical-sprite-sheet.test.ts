import { test } from "bun:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import {
  composeCenteredVerticalSpriteSheet,
  type DecodedSpriteSheetFrame,
} from "./compose-centered-vertical-sprite-sheet.ts"

const fixtures = [
  { width: 2, height: 2, color: [231, 17, 23, 255] },
  { width: 4, height: 1, color: [31, 211, 37, 255] },
  { width: 1, height: 3, color: [41, 43, 223, 255] },
  { width: 3, height: 2, color: [227, 181, 47, 255] },
  { width: 2, height: 4, color: [191, 53, 197, 255] },
  { width: 1, height: 1, color: [61, 199, 211, 255] },
] as const

test("centers unequal RGBA images in transparent cells and preserves row order", async () => {
  const frames = await Promise.all(
    fixtures.map(async (fixture, index) => ({
      label: `grade-${index}`,
      image: await sharp({
        create: {
          width: fixture.width,
          height: fixture.height,
          channels: 4,
          background: {
            r: fixture.color[0],
            g: fixture.color[1],
            b: fixture.color[2],
            alpha: fixture.color[3] / 255,
          },
        },
      })
        .png()
        .toBuffer(),
    })),
  )

  const { data, info } = await sharp(await composeCenteredVerticalSpriteSheet(frames))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  assert.deepEqual({ width: info.width, height: info.height }, { width: 4, height: 24 })
  for (const [row, fixture] of fixtures.entries()) {
    const left = Math.floor((4 - fixture.width) / 2)
    const top = row * 4 + Math.floor((4 - fixture.height) / 2)
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const inside =
          x >= left &&
          x < left + fixture.width &&
          y >= top - row * 4 &&
          y < top - row * 4 + fixture.height
        assert.deepEqual(
          pixelAt(data, info.width, x, row * 4 + y),
          inside ? fixture.color : [0, 0, 0, 0],
        )
      }
    }
  }
})

test("rejects an empty sprite sheet", async () => {
  await assert.rejects(() => composeCenteredVerticalSpriteSheet([]), /at least one/i)
})

test("settles every frame decode before rethrowing the first contextual cause", async () => {
  const firstFailure = new Error("first decode failed")
  const pending = [deferred<DecodedSpriteSheetFrame>(), deferred<DecodedSpriteSheetFrame>()]
  const composing = composeCenteredVerticalSpriteSheet(
    [
      { label: "marvelous from first.png", image: Buffer.from("first") },
      { label: "perfect from second.png", image: Buffer.from("second") },
    ],
    {
      decode: (_image, index) => pending[index]?.promise ?? Promise.reject(new Error("bad index")),
    },
  )

  pending[0]?.reject(firstFailure)
  let settled = false
  void composing.catch(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)

  pending[1]?.resolve({ data: Buffer.from([0, 0, 0, 0]), width: 1, height: 1 })
  await assert.rejects(composing, (error) => {
    assert(error instanceof Error)
    assert.match(error.message, /marvelous.*first\.png/i)
    assert.equal(error.cause, firstFailure)
    return true
  })
})

function pixelAt(data: Buffer, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4
  return [
    data[offset] ?? -1,
    data[offset + 1] ?? -1,
    data[offset + 2] ?? -1,
    data[offset + 3] ?? -1,
  ]
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  let reject!: Deferred<T>["reject"]
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
