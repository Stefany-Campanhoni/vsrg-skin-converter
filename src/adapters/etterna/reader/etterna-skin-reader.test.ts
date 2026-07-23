import assert from "node:assert/strict"
import test from "node:test"
import type { ImageAsset, ReceptorSet, TapNoteSet } from "../../../domain/image.ts"
import type { SkinReference } from "../../../domain/skin.ts"
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

test("loads one NoteSkin context and shares it across asset analyzers", async () => {
  const reference: SkinReference = {
    game: "etterna",
    name: "Fixture",
    sourcePath: "C:/Etterna/NoteSkins/dance/Fixture",
    gameRoot: "C:/Etterna",
  }
  const context = { filePath: "NoteSkin.lua" } as NoteSkinContext
  let contextLoads = 0
  const seenContexts: NoteSkinContext[] = []
  const reader = new EtternaSkinReader({
    readProfile: async () => ({
      hitPosition: -6,
      judgementPosition: 4,
      comboPosition: 8,
      columnWidth: 100,
    }),
    loadNoteSkinContext: async () => {
      contextLoads += 1
      return context
    },
    analyzeReceptors: async (received) => {
      seenContexts.push(received)
      return { receptors, diagnostics: [] }
    },
    analyzeNotes: async (received) => {
      seenContexts.push(received)
      return { notes: tapNotes, diagnostics: [] }
    },
  })

  const skin = await reader.readSkin(reference)

  assert.equal(contextLoads, 1)
  assert.deepEqual(seenContexts, [context, context])
  assert.equal(skin.game, "etterna")
  assert.equal(skin.metadata.name, "Fixture")
  assert.equal(skin.playfield.hitPosition, -6)
  assert.equal(skin.playfield.columnWidth, 100)
  assert.equal(skin.assets.receptors, receptors)
  assert.equal(skin.assets.tapNotes, tapNotes)
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
