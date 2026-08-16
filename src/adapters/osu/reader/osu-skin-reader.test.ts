import assert from "node:assert/strict"
import test from "node:test"
import type { ImageAsset } from "../../../domain/image.ts"
import type { SkinReference } from "../../../domain/skin.ts"
import type { ResolveOsuJudgementAssetOptions } from "../judgements/resolve-osu-judgement-asset.ts"
import { OsuSkinReader, type OsuSkinReaderDependencies } from "./osu-skin-reader.ts"

const source = `[General]
Name: Parsed Fixture

[Mania]
Keys: 4
HitPosition: 436
ComboPosition: 250
ScorePosition: 280
ColumnWidth: 68,68,70,70
KeyImage0: receptor-left
KeyImage1: receptor-down
KeyImage2: receptor-up
KeyImage3: receptor-right
KeyImage0D: receptor-left-pressed
KeyImage1D: receptor-down-pressed
KeyImage2D: receptor-up-pressed
KeyImage3D: receptor-right-pressed
NoteImage0: note-left
NoteImage1: note-down
NoteImage2: note-up
NoteImage3: note-right
Hit300g: judgement-marvelous
Hit300: judgement-perfect
Hit200: judgement-great
Hit100: judgement-good
Hit50: judgement-bad
Hit0: judgement-miss
`

const logicalPaths = [
  "receptor-left",
  "receptor-left-pressed",
  "receptor-down",
  "receptor-down-pressed",
  "receptor-up",
  "receptor-up-pressed",
  "receptor-right",
  "receptor-right-pressed",
  "note-left",
  "note-down",
  "note-up",
  "note-right",
  "judgement-marvelous",
  "judgement-perfect",
  "judgement-great",
  "judgement-good",
  "judgement-bad",
  "judgement-miss",
] as const

test("reads the 4K Mania definition into an osu skin model", async () => {
  const started: string[] = []
  const settled: string[] = []
  const dependencies = withGenericJudgementResolver({
    readSkinIni: async (skinDirectory) => {
      assert.equal(skinDirectory, reference.sourcePath)
      return { source, filePath: "C:/osu/Skins/Fixture/SKIN.InI" }
    },
    resolveAsset: async (options) => {
      started.push(options.logicalPath)
      assert.equal(options.skinDirectory, reference.sourcePath)
      assert.equal(options.useDoubleResolutionAssets, true)
      await Promise.resolve()
      settled.push(options.logicalPath)
      return {
        filePath: `${options.logicalPath}@2x.png`,
        rotation: 0,
        pixelDensity: "double",
      }
    },
  })

  const model = await new OsuSkinReader(
    { useDoubleResolutionAssets: true, scrollSpeed: 29 },
    dependencies,
  ).readSkin(reference)

  assert.deepEqual(started, logicalPaths)
  assert.deepEqual(settled, logicalPaths)
  assert.equal(model.game, "osu")
  assert.deepEqual(model.metadata, { name: "Parsed Fixture" })
  assert.deepEqual(model.playfield, {
    hitPosition: 436,
    comboPosition: 250,
    judgementPosition: 280,
    columnWidth: 69,
    comboScale: 1,
    judgementScale: 1,
    scrollSpeed: 29,
    isDownscroll: false,
  })
  assert.deepEqual(model.assets.receptors, {
    left: {
      normal: asset("receptor-left"),
      pressed: asset("receptor-left-pressed"),
    },
    down: {
      normal: asset("receptor-down"),
      pressed: asset("receptor-down-pressed"),
    },
    up: {
      normal: asset("receptor-up"),
      pressed: asset("receptor-up-pressed"),
    },
    right: {
      normal: asset("receptor-right"),
      pressed: asset("receptor-right-pressed"),
    },
  })
  assert.deepEqual(model.assets.tapNotes, {
    left: asset("note-left"),
    down: asset("note-down"),
    up: asset("note-up"),
    right: asset("note-right"),
  })
  assert.deepEqual(model.assets.judgements, {
    sourceDensity: 2,
    images: {
      marvelous: asset("judgement-marvelous"),
      perfect: asset("judgement-perfect"),
      great: asset("judgement-great"),
      good: asset("judgement-good"),
      bad: asset("judgement-bad"),
      miss: asset("judgement-miss"),
    },
  })
  assert.deepEqual(model.diagnostics, [])
})

test("rejects mixed osu judgement densities", async () => {
  const reader = new OsuSkinReader(
    { useDoubleResolutionAssets: true, scrollSpeed: 29 },
    withGenericJudgementResolver({
      readSkinIni: async () => ({ source, filePath: "C:/osu/Skins/Fixture/skin.ini" }),
      resolveAsset: async (options) => ({
        filePath: `${options.logicalPath}.png`,
        rotation: 0,
        pixelDensity: options.logicalPath === "judgement-miss" ? "standard" : "double",
      }),
    }),
  )

  await assert.rejects(() => reader.readSkin(reference), /mixed.*judgement.*densit/i)
})

test("resolves absent judgement properties through osu default filenames", async () => {
  const sourceWithoutJudgements = source
    .split("\n")
    .filter((line) => !/^Hit(?:300g|300|200|100|50|0):/.test(line))
    .join("\n")
  const requestedJudgements: ResolveOsuJudgementAssetOptions[] = []
  const reader = new OsuSkinReader(
    { useDoubleResolutionAssets: false, scrollSpeed: 29 },
    {
      readSkinIni: async () => ({
        source: sourceWithoutJudgements,
        filePath: "C:/osu/Skins/Fixture/skin.ini",
      }),
      resolveAsset: async (options) => ({
        filePath: `${options.logicalPath}.png`,
        rotation: 0,
        pixelDensity: "standard",
      }),
      resolveJudgementAsset: async (options: ResolveOsuJudgementAssetOptions) => {
        requestedJudgements.push(options)
        return {
          filePath: `${options.defaultFileName}.png`,
          rotation: 0,
          pixelDensity: "standard",
        }
      },
    },
  )

  const model = await reader.readSkin(reference)

  assert.deepEqual(
    requestedJudgements.map(({ logicalPath, defaultFileName }) => ({
      logicalPath,
      defaultFileName,
    })),
    [
      { logicalPath: undefined, defaultFileName: "mania-hit300g" },
      { logicalPath: undefined, defaultFileName: "mania-hit300" },
      { logicalPath: undefined, defaultFileName: "mania-hit200" },
      { logicalPath: undefined, defaultFileName: "mania-hit100" },
      { logicalPath: undefined, defaultFileName: "mania-hit50" },
      { logicalPath: undefined, defaultFileName: "mania-hit0" },
    ],
  )
  assert.equal(model.assets.judgements?.images.miss.filePath, "mania-hit0.png")
})

test("rejects a judgement whose resolved density is missing", async () => {
  const reader = new OsuSkinReader(
    { useDoubleResolutionAssets: false, scrollSpeed: 29 },
    withGenericJudgementResolver({
      readSkinIni: async () => ({ source, filePath: "C:/osu/Skins/Fixture/skin.ini" }),
      resolveAsset: async (options) => ({
        filePath: `${options.logicalPath}.png`,
        rotation: 0,
        pixelDensity: options.logicalPath === "judgement-good" ? undefined : "standard",
      }),
    }),
  )

  await assert.rejects(() => reader.readSkin(reference), /missing.*judgement.*densit/i)
})

test("rejects references from another game before reading inputs", async () => {
  let readStarted = false
  const reader = new OsuSkinReader(
    { useDoubleResolutionAssets: false, scrollSpeed: 29 },
    withGenericJudgementResolver({
      readSkinIni: async () => {
        readStarted = true
        throw new Error("should not run")
      },
      resolveAsset: async () => {
        throw new Error("should not run")
      },
    }),
  )

  await assert.rejects(
    () => reader.readSkin({ ...reference, game: "etterna" }),
    /osu reader.*etterna/i,
  )
  assert.equal(readStarted, false)
})

test("wraps duplicate General sections with skin reader context and preserves the parser error", async () => {
  const iniPath = "C:/osu/Skins/Fixture/skin.ini"
  const reader = new OsuSkinReader(
    { useDoubleResolutionAssets: false, scrollSpeed: 29 },
    withGenericJudgementResolver({
      readSkinIni: async () => ({
        source: `${source}\n[gEnErAl]\nName: Conflicting Name`,
        filePath: iniPath,
      }),
      resolveAsset: async () => {
        throw new Error("asset resolution must not start")
      },
    }),
  )

  await assert.rejects(
    () => reader.readSkin(reference),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Could not parse osu skin\.ini.*Fixture.*skin\.ini/i)
      assert.ok(error.cause instanceof Error)
      assert.match(error.cause.message, /exactly one General section.*skin\.ini/i)
      return true
    },
  )
})

test("settles all eighteen assets and reports the first input-order failure with context", async () => {
  const pending = new Map<string, Deferred<ImageAsset>>()
  const started: string[] = []
  const firstFailure = new Error("pressed receptor missing")
  const laterFailure = new Error("tap note missing")
  const reader = new OsuSkinReader(
    { useDoubleResolutionAssets: false, scrollSpeed: 29 },
    withGenericJudgementResolver({
      readSkinIni: async () => ({ source, filePath: "C:/osu/Skins/Fixture/skin.ini" }),
      resolveAsset: (options) => {
        started.push(options.logicalPath)
        const task = deferred<ImageAsset>()
        pending.set(options.logicalPath, task)
        return task.promise
      },
    }),
  )

  const reading = reader.readSkin(reference)
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(started, logicalPaths)

  pending.get("receptor-left-pressed")?.reject(firstFailure)
  pending.get("note-left")?.reject(laterFailure)
  for (const logicalPath of logicalPaths) {
    if (
      logicalPath !== "receptor-left-pressed" &&
      logicalPath !== "note-left" &&
      logicalPath !== "note-right"
    ) {
      pending.get(logicalPath)?.resolve({ filePath: `${logicalPath}.png`, rotation: 0 })
    }
  }
  let readingSettled = false
  void reading.catch(() => {
    readingSettled = true
  })
  await Promise.resolve()
  assert.equal(readingSettled, false)

  pending.get("note-right")?.resolve({ filePath: "note-right.png", rotation: 0 })

  await assert.rejects(reading, (error) => {
    assert.match(String(error), /receptors\.left\.pressed/)
    assert.equal((error as Error).cause, firstFailure)
    return true
  })
})

const reference: SkinReference = {
  game: "osu",
  name: "Catalog Name Must Not Win",
  sourcePath: "C:/osu/Skins/Fixture",
  gameRoot: "C:/osu",
}

function asset(logicalPath: string): ImageAsset {
  return { filePath: `${logicalPath}@2x.png`, rotation: 0, pixelDensity: "double" }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function withGenericJudgementResolver(
  dependencies: Omit<OsuSkinReaderDependencies, "resolveJudgementAsset">,
): OsuSkinReaderDependencies {
  return {
    ...dependencies,
    resolveJudgementAsset: (options) =>
      dependencies.resolveAsset({
        skinDirectory: options.skinDirectory,
        logicalPath: options.logicalPath ?? options.defaultFileName,
        useDoubleResolutionAssets: options.useDoubleResolutionAssets,
      }),
  }
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
