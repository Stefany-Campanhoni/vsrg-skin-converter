import { expect, test } from "bun:test"
import type { SkinModel } from "../../domain/skin.ts"
import { EtternaToOsuConversion } from "./etterna-to-osu-conversion.ts"

const etternaSkin = {
  game: "etterna",
  metadata: { name: "Fixture" },
  playfield: {
    hitPosition: -6.6,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 108,
    comboScale: 0.6,
    judgementScale: 0.675,
    scrollSpeed: 888,
  },
  assets: {},
  diagnostics: [
    {
      code: "fixture.warning",
      severity: "warning",
      component: "fixture",
      message: "Fixture warning",
    },
  ],
} satisfies SkinModel

test("converts Etterna playfield coordinates into an osu skin model", async () => {
  const conversion = new EtternaToOsuConversion()

  const result = await conversion.convert(etternaSkin)

  expect(result.game).toBe("osu")
  expect(result.playfield.hitPosition).toBe(432)
  expect(result.playfield.judgementPosition).toBe(244)
  expect(result.playfield.comboPosition).toBe(209)
  expect(result.playfield.columnWidth).toBe(70)
  expect(result.playfield.scrollSpeed).toBe(29)
  expect(result.playfield.comboScale).toBe(0.6)
  expect(result.playfield.judgementScale).toBe(0.675)
  expect(result.assets).toBe(etternaSkin.assets)
  expect(result.diagnostics).toBe(etternaSkin.diagnostics)
})

test("rejects a source model from another game", async () => {
  const conversion = new EtternaToOsuConversion()

  await expect((() => conversion.convert({ ...etternaSkin, game: "osu" }))()).rejects.toThrow(
    /Etterna.*osu/i,
  )
})
