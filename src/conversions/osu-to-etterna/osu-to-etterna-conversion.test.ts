import assert from "node:assert/strict"
import test from "node:test"
import type { SkinModel } from "../../domain/skin.ts"
import { OsuToEtternaConversion } from "./osu-to-etterna-conversion.ts"

const osuSkin = {
  game: "osu",
  metadata: { name: "Fixture" },
  playfield: {
    hitPosition: 432,
    judgementPosition: 244,
    comboPosition: 209,
    columnWidth: 68.5,
    comboScale: 1,
    judgementScale: 1,
  },
  assets: {
    receptors: {
      left: { normal: asset("left"), pressed: asset("leftD") },
      down: { normal: asset("down"), pressed: asset("downD") },
      up: { normal: asset("up"), pressed: asset("upD") },
      right: { normal: asset("right"), pressed: asset("rightD") },
    },
    tapNotes: {
      left: asset("left-note"),
      down: asset("down-note"),
      up: asset("up-note"),
      right: asset("right-note"),
    },
  },
  diagnostics: [
    {
      code: "fixture.warning",
      severity: "warning",
      component: "fixture",
      message: "Fixture warning",
    },
  ],
} satisfies SkinModel

test("converts an osu playfield while preserving source-owned data", async () => {
  const conversion = new OsuToEtternaConversion()

  const result = await conversion.convert(osuSkin)

  assert.equal(result.game, "etterna")
  assert.equal(result.metadata, osuSkin.metadata)
  assert.deepEqual(result.playfield, {
    hitPosition: -7,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 107,
    comboScale: 1,
    judgementScale: 1,
  })
  assert.equal(result.assets, osuSkin.assets)
  assert.equal(result.diagnostics, osuSkin.diagnostics)
})

test("rejects a source model from another game", async () => {
  const conversion = new OsuToEtternaConversion()

  await assert.rejects(() => conversion.convert({ ...osuSkin, game: "etterna" }), /osu.*etterna/i)
})

test("rejects incomplete osu reverse-conversion inputs", async () => {
  const conversion = new OsuToEtternaConversion()
  const incomplete = {
    ...osuSkin,
    playfield: { ...osuSkin.playfield, columnWidth: undefined },
  } as unknown as SkinModel

  await assert.rejects(() => conversion.convert(incomplete), /columnWidth/i)
})

function asset(name: string) {
  return { filePath: `${name}.png`, rotation: 0, pixelDensity: "double" as const }
}
