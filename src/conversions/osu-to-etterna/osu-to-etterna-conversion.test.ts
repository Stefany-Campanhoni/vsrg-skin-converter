import { expect, test } from "bun:test"
import type { SkinModel } from "../../domain/skin.ts"
import { OsuToEtternaConversion } from "./osu-to-etterna-conversion.ts"

const osuSkin = {
  game: "osu",
  metadata: { name: "Fixture" },
  playfield: {
    hitPosition: 432,
    judgementPosition: 244,
    comboPosition: 209,
    columnWidth: 68,
    comboScale: 1,
    judgementScale: 1,
    scrollSpeed: 29,
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

  expect(result.game).toBe("etterna")
  expect(result.metadata).toBe(osuSkin.metadata)
  expect(result.playfield).toStrictEqual({
    hitPosition: -7,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 106,
    comboScale: 1,
    judgementScale: 1,
    scrollSpeed: 902,
  })
  expect(result.assets).toBe(osuSkin.assets)
  expect(result.diagnostics).toBe(osuSkin.diagnostics)
})

test("rejects a source model from another game", async () => {
  const conversion = new OsuToEtternaConversion()

  await expect((() => conversion.convert({ ...osuSkin, game: "etterna" }))()).rejects.toThrow(
    /osu.*etterna/i,
  )
})

test("rejects incomplete osu reverse-conversion inputs", async () => {
  const conversion = new OsuToEtternaConversion()
  const incomplete = {
    ...osuSkin,
    playfield: { ...osuSkin.playfield, columnWidth: undefined },
  } as unknown as SkinModel

  await expect((() => conversion.convert(incomplete))()).rejects.toThrow(/columnWidth/i)
})

function asset(name: string) {
  return { filePath: `${name}.png`, rotation: 0, pixelDensity: "double" as const }
}
