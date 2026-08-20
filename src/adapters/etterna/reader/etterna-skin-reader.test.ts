import assert from "node:assert/strict"
import test from "node:test"
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
        assert.equal(receivedProfileId, "selected-profile")
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

  assert.equal(judgementGameRoot, reference.gameRoot)
  assert.equal(cmodGameRoot, reference.gameRoot)
  assert.equal(profileGameRoot, reference.gameRoot)
  assert.equal(profileId, "selected-profile")
  assert.equal(profileTheme, "Rebirth")
  assert.equal(judgementProfileId, "selected-profile")
  assert.equal(judgementTheme, "Rebirth")
  assert.deepEqual(sequence, ["context-start", "judgements-start"])
  resolveContext()
  await Promise.resolve()
  assert.deepEqual(sequence, ["context-start", "judgements-start"])

  resolveJudgements()
  const skin = await skinPromise

  assert.equal(contextLoads, 1)
  assert.deepEqual(seenContexts, [context, context])
  assert.deepEqual(sequence, [
    "context-start",
    "judgements-start",
    "receptors-start",
    "notes-start",
  ])
  assert.equal(skin.game, "etterna")
  assert.equal(skin.metadata.name, "Fixture")
  assert.equal(skin.playfield.hitPosition, -6)
  assert.equal(skin.playfield.columnWidth, 100)
  assert.equal(skin.playfield.comboScale, 1)
  assert.equal(skin.playfield.judgementScale, 1)
  assert.equal(skin.playfield.scrollSpeed, 888)
  assert.equal(skin.assets.receptors, receptors)
  assert.equal(skin.assets.tapNotes, tapNotes)
  assert.equal(skin.assets.judgements, judgements)
  assert.deepEqual(skin.diagnostics, [
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
  assert.equal(judgementStarted, true)
  let settled = false
  void reading.catch(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)

  profile.resolve({
    hitPosition: -6,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 100,
    comboScale: 1,
    judgementScale: 1,
  })
  await assert.rejects(reading, (error) => error === failure)
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
      loadNoteSkinContext: async () => ({ filePath: "NoteSkin.lua" }) as NoteSkinContext,
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
  assert.equal(phase, "started")
  let settled = false
  void reading.catch(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)

  receptorAnalysis.resolve({ receptors, diagnostics: [] })
  await assert.rejects(reading, (error) => error === failure)
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

  await assert.rejects(
    () =>
      reader.readSkin({
        game: "osu",
        name: "Fixture",
        sourcePath: "C:/osu/Skins/Fixture",
        gameRoot: "C:/osu",
      }),
    /Etterna reader.*osu/i,
  )
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
