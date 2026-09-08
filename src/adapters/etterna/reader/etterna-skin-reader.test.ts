import { expect, test } from "bun:test"
import { expectRejectionSatisfies } from "../../../../tests/support/expectations.ts"
import type { ImageAsset, ReceptorSet, TapNoteSet } from "../../../domain/image.ts"
import { type JudgementSet, judgementGrades } from "../../../domain/judgement.ts"
import type { SkinReference } from "../../../domain/skin.ts"
import type { EtternaJudgementAnalysis } from "../judgements/read-etterna-judgements.ts"
import type { NoteSkinContext } from "../noteskin/note-skin-context.ts"
import { EtternaSkinReader } from "./etterna-skin-reader.ts"

const image: ImageAsset = { filePath: "fixture.png", rotation: 0 }
const receptors: ReceptorSet = {
  left: { normal: image, pressed: image },
  down: { normal: image, pressed: image },
  up: { normal: image, pressed: image },
  right: { normal: image, pressed: image },
}
const tapNotes: TapNoteSet = {
  left: image,
  down: image,
  up: image,
  right: image,
}
const judgements: JudgementSet = {
  sourceDensity: 1,
  images: Object.fromEntries(
    judgementGrades.map((grade) => [grade, image]),
  ) as JudgementSet["images"],
}

test("loads initial inputs concurrently and publishes assets with ordered diagnostics", async () => {
  const reference: SkinReference = {
    game: "etterna",
    name: "Fixture",
    sourcePath: "C:/Etterna/NoteSkins/dance/Fixture",
    gameRoot: "C:/Etterna",
  }
  const context = { filePath: "NoteSkin.lua" } as NoteSkinContext
  let contextLoads = 0
  const seenContexts: NoteSkinContext[] = []
  const sequence: string[] = []
  let judgementGameRoot: string | undefined
  let cmodGameRoot: string | undefined
  let profileGameRoot: string | undefined
  let profileId: string | undefined
  let profileTheme: string | undefined
  let judgementProfileId: string | undefined
  let judgementTheme: string | undefined
  let resolveContext: () => void = () => {
    throw new Error("context promise was not initialized")
  }
  const contextPromise = new Promise<NoteSkinContext>((resolve) => {
    resolveContext = () => resolve(context)
  })
  let resolveJudgements: () => void = () => {
    throw new Error("judgement promise was not initialized")
  }
  const judgementPromise = new Promise<EtternaJudgementAnalysis>((resolve) => {
    resolveJudgements = () =>
      resolve({
        judgements,
        diagnostics: [
          {
            code: "judgement-warning",
            severity: "warning",
            component: "judgements",
            message: "fixture fallback",
          },
        ],
      })
  })
  const reader = new EtternaSkinReader(
    { profileId: "selected-profile", theme: "Rebirth" },
    {
      readProfile: async (gameRoot, receivedProfileId, receivedTheme) => {
        profileGameRoot = gameRoot
        profileId = receivedProfileId
        profileTheme = receivedTheme
        return {
          hitPosition: -6,
          judgementPosition: 4,
          comboPosition: 8,
          columnWidth: 100,
          comboScale: 1,
          judgementScale: 1,
        }
      },
      readCmod: async (gameRoot, receivedProfileId) => {
        cmodGameRoot = gameRoot
        expect(receivedProfileId).toBe("selected-profile")
        return 888
      },
      loadNoteSkinContext: async () => {
        contextLoads += 1
        sequence.push("context-start")
        return contextPromise
      },
      analyzeReceptors: async (received) => {
        sequence.push("receptors-start")
        seenContexts.push(received)
        return {
          receptors,
          diagnostics: [
            {
              code: "receptor-warning",
              severity: "warning",
              component: "receptors",
              direction: "left",
              message: "receptor fallback",
            },
          ],
        }
      },
      analyzeNotes: async (received) => {
        sequence.push("notes-start")
        seenContexts.push(received)
        return {
          notes: tapNotes,
          diagnostics: [
            {
              code: "note-warning",
              severity: "warning",
              component: "notes",
              direction: "down",
              message: "note fallback",
            },
          ],
        }
      },
      analyzeJudgements: async (gameRoot, receivedProfileId, receivedTheme) => {
        judgementGameRoot = gameRoot
        judgementProfileId = receivedProfileId
        judgementTheme = receivedTheme
        sequence.push("judgements-start")
        return judgementPromise
      },
    },
  )

  const skinPromise = reader.readSkin(reference)

  expect(judgementGameRoot).toBe(reference.gameRoot)
  expect(cmodGameRoot).toBe(reference.gameRoot)
  expect(profileGameRoot).toBe(reference.gameRoot)
  expect(profileId).toBe("selected-profile")
  expect(profileTheme).toBe("Rebirth")
  expect(judgementProfileId).toBe("selected-profile")
  expect(judgementTheme).toBe("Rebirth")
  expect(sequence).toStrictEqual(["context-start", "judgements-start"])
  resolveContext()
  await Promise.resolve()
  expect(sequence).toStrictEqual(["context-start", "judgements-start"])

  resolveJudgements()
  const skin = await skinPromise

  expect(contextLoads).toBe(1)
  expect(seenContexts).toStrictEqual([context, context])
  expect(sequence).toStrictEqual([
    "context-start",
    "judgements-start",
    "receptors-start",
    "notes-start",
  ])
  expect(skin.game).toBe("etterna")
  expect(skin.metadata.name).toBe("Fixture")
  expect(skin.playfield.hitPosition).toBe(-6)
  expect(skin.playfield.columnWidth).toBe(100)
  expect(skin.playfield.comboScale).toBe(1)
  expect(skin.playfield.judgementScale).toBe(1)
  expect(skin.playfield.scrollSpeed).toBe(888)
  expect(skin.assets.receptors).toBe(receptors)
  expect(skin.assets.tapNotes).toBe(tapNotes)
  expect(skin.assets.judgements).toBe(judgements)
  expect(skin.diagnostics).toStrictEqual([
    {
      code: "receptor-warning",
      severity: "warning",
      component: "receptors",
      direction: "left",
      message: "receptor fallback",
    },
    {
      code: "note-warning",
      severity: "warning",
      component: "notes",
      direction: "down",
      message: "note fallback",
    },
    {
      code: "judgement-warning",
      severity: "warning",
      component: "judgements",
      message: "fixture fallback",
    },
  ])
})

test("starts and settles every initial reader dependency after a synchronous failure", async () => {
  const profile = deferred<{
    hitPosition: number
    judgementPosition: number
    comboPosition: number
    columnWidth: number
    comboScale: number
    judgementScale: number
  }>()
  const failure = new Error("exact synchronous context failure")
  let judgementStarted = false
  const reader = new EtternaSkinReader(
    { profileId: "selected-profile", theme: "Rebirth" },
    {
      readProfile: () => profile.promise,
      readCmod: async () => 888,
      loadNoteSkinContext: () => {
        throw failure
      },
      analyzeJudgements: async () => {
        judgementStarted = true
        return { judgements, diagnostics: [] }
      },
      analyzeReceptors: async () => ({ receptors, diagnostics: [] }),
      analyzeNotes: async () => ({ notes: tapNotes, diagnostics: [] }),
    },
  )

  const reading = reader.readSkin(etternaReference)
  await Promise.resolve()
  expect(judgementStarted).toBe(true)
  let settled = false
  void reading.catch(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)

  profile.resolve({
    hitPosition: -6,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 100,
    comboScale: 1,
    judgementScale: 1,
  })
  await expectRejectionSatisfies(reading, (error) => error === failure)
})

test("settles both NoteSkin analyses after a synchronous failure", async () => {
  const receptorAnalysis = deferred<{ receptors: ReceptorSet; diagnostics: [] }>()
  const analysesStarted = deferred<void>()
  const failure = new Error("exact synchronous note failure")
  const reader = new EtternaSkinReader(
    { profileId: "selected-profile", theme: "Rebirth" },
    {
      readProfile: async () => ({
        hitPosition: -6,
        judgementPosition: 4,
        comboPosition: -20,
        columnWidth: 100,
        comboScale: 1,
        judgementScale: 1,
      }),
      readCmod: async () => 888,
      loadNoteSkinContext: async () =>
        ({
          filePath: "NoteSkin.lua",
        }) as NoteSkinContext,
      analyzeJudgements: async () => ({ judgements, diagnostics: [] }),
      analyzeReceptors: () => receptorAnalysis.promise,
      analyzeNotes: () => {
        analysesStarted.resolve()
        throw failure
      },
    },
  )

  const reading = reader.readSkin(etternaReference)
  const phase = await Promise.race([
    analysesStarted.promise.then(() => "started"),
    reading.then(
      () => "completed",
      () => "rejected",
    ),
  ])
  expect(phase).toBe("started")
  let settled = false
  void reading.catch(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)

  receptorAnalysis.resolve({ receptors, diagnostics: [] })
  await expectRejectionSatisfies(reading, (error) => error === failure)
})

test("rejects references from another game", async () => {
  const reader = new EtternaSkinReader(
    { profileId: "selected-profile", theme: "Rebirth" },
    {
      readProfile: async () => {
        throw new Error("should not run")
      },
      readCmod: async () => {
        throw new Error("should not run")
      },
      loadNoteSkinContext: async () => {
        throw new Error("should not run")
      },
      analyzeReceptors: async () => {
        throw new Error("should not run")
      },
      analyzeNotes: async () => {
        throw new Error("should not run")
      },
      analyzeJudgements: async () => {
        throw new Error("should not run")
      },
    },
  )

  await expect(
    (() =>
      reader.readSkin({
        game: "osu",
        name: "Fixture",
        sourcePath: "C:/osu/Skins/Fixture",
        gameRoot: "C:/osu",
      }))(),
  ).rejects.toThrow(/Etterna reader.*osu/i)
})

const etternaReference: SkinReference = {
  game: "etterna",
  name: "Fixture",
  sourcePath: "C:/Etterna/NoteSkins/dance/Fixture",
  gameRoot: "C:/Etterna",
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
