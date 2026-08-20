import assert from "node:assert/strict"
import test from "node:test"
import type { JudgementGrade, JudgementSet } from "../../../domain/judgement.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import type { CenteredSpriteSheetFrame } from "../../../infrastructure/image/compose-centered-vertical-sprite-sheet.ts"
import { EtternaJudgementWriter } from "./etterna-judgement-writer.ts"

test("reads judgements in Etterna row order, composes once, and writes the resulting sheet", async () => {
  const reads: string[] = []
  const writes: Array<{ path: string; data: Buffer }> = []
  let composedFrames: readonly CenteredSpriteSheetFrame[] = []
  const writer = new EtternaJudgementWriter({
    readFile: async (filePath) => {
      reads.push(filePath)
      return Buffer.from(filePath)
    },
    compose: async (frames) => {
      composedFrames = frames
      return Buffer.from("sheet")
    },
    writeFile: async (filePath, data) => {
      writes.push({ path: filePath, data })
    },
  })

  await writer.writeJudgement(etternaSkin(), "staging/judgement.png")

  const expectedPaths = [
    "marvelous.png",
    "perfect.png",
    "great.png",
    "good.png",
    "bad.png",
    "miss.png",
  ]
  assert.deepEqual(reads, expectedPaths)
  assert.deepEqual(
    composedFrames.map(({ label, image }) => ({ label, image: image.toString() })),
    expectedPaths.map((filePath) => ({ label: filePath.replace(".png", ""), image: filePath })),
  )
  assert.deepEqual(writes, [{ path: "staging/judgement.png", data: Buffer.from("sheet") }])
})

test("rejects non-Etterna and judgement-free models before reading files", async () => {
  let reads = 0
  const writer = new EtternaJudgementWriter({
    readFile: async () => {
      reads += 1
      return Buffer.alloc(0)
    },
    compose: async () => Buffer.alloc(0),
    writeFile: async () => {},
  })
  const skin = etternaSkin()

  await assert.rejects(
    () => writer.writeJudgement({ ...skin, game: "osu" }, "output.png"),
    /cannot write.*osu/i,
  )
  await assert.rejects(
    () =>
      writer.writeJudgement(
        { ...skin, assets: { ...skin.assets, judgements: undefined } },
        "output.png",
      ),
    /does not contain judgements/i,
  )
  assert.equal(reads, 0)
})

test("settles every source read before rethrowing the first contextual failure", async () => {
  const failures = [new Error("marvelous failed"), new Error("perfect failed")]
  let started = 0
  let settled = 0
  const writer = new EtternaJudgementWriter({
    readFile: (filePath) => {
      const index = started++
      return new Promise<Buffer>((resolve, reject) => {
        setImmediate(() => {
          settled += 1
          if (index < failures.length) reject(failures[index])
          else resolve(Buffer.from(filePath))
        })
      })
    },
    compose: async () => Buffer.alloc(0),
    writeFile: async () => {},
  })

  await assert.rejects(
    () => writer.writeJudgement(etternaSkin(), "output.png"),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /marvelous.*marvelous\.png/i)
      assert.equal(error.cause, failures[0])
      return true
    },
  )
  assert.equal(started, 6)
  assert.equal(settled, 6)
})

test("preserves compositor and writer failures as contextual causes", async () => {
  const composeFailure = new Error("compose failed")
  const writeFailure = new Error("write failed")
  const skin = etternaSkin()

  await assert.rejects(
    () =>
      new EtternaJudgementWriter({
        readFile: async (filePath) => Buffer.from(filePath),
        compose: async () => {
          throw composeFailure
        },
        writeFile: async () => {},
      }).writeJudgement(skin, "output.png"),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /compose Etterna judgement/i)
      assert.equal(error.cause, composeFailure)
      return true
    },
  )

  await assert.rejects(
    () =>
      new EtternaJudgementWriter({
        readFile: async (filePath) => Buffer.from(filePath),
        compose: async () => Buffer.from("sheet"),
        writeFile: async () => {
          throw writeFailure
        },
      }).writeJudgement(skin, "output.png"),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /write Etterna judgement.*output\.png/i)
      assert.equal(error.cause, writeFailure)
      return true
    },
  )
})

function etternaSkin(): SkinModel {
  const images = Object.fromEntries(
    (["marvelous", "perfect", "great", "good", "bad", "miss"] satisfies JudgementGrade[]).map(
      (grade) => [grade, { filePath: `${grade}.png`, rotation: 0 }],
    ),
  ) as JudgementSet["images"]

  return {
    game: "etterna",
    metadata: { name: "Skin" },
    playfield: {
      hitPosition: 0,
      judgementPosition: 0,
      comboPosition: 0,
      columnWidth: 100,
      comboScale: 1,
      judgementScale: 1,
      scrollSpeed: 1,
    },
    assets: { judgements: { sourceDensity: 1, images } },
    diagnostics: [],
  }
}
