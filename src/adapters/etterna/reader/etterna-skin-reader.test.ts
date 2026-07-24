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
  const reader = new EtternaSkinReader({
    readProfile: async () => ({
      hitPosition: -6,
      judgementPosition: 4,
      comboPosition: 8,
      columnWidth: 100,
    }),
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
    analyzeJudgements: async (gameRoot) => {
      judgementGameRoot = gameRoot
      sequence.push("judgements-start")
      return judgementPromise
    },
  })

  const skinPromise = reader.readSkin(reference)

  assert.equal(judgementGameRoot, reference.gameRoot)
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

test("rejects references from another game", async () => {
  const reader = new EtternaSkinReader({
    readProfile: async () => {
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
  })

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
