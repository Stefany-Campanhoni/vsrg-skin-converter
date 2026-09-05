import { test } from "bun:test"
import assert from "node:assert/strict"
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

  assert.equal(result.game, "osu")
  assert.equal(result.playfield.hitPosition, 432)
  assert.equal(result.playfield.judgementPosition, 244)
  assert.equal(result.playfield.comboPosition, 209)
  assert.equal(result.playfield.columnWidth, 70)
  assert.equal(result.playfield.scrollSpeed, 29)
  assert.equal(result.playfield.comboScale, 0.6)
  assert.equal(result.playfield.judgementScale, 0.675)
  assert.equal(result.assets, etternaSkin.assets)
  assert.equal(result.diagnostics, etternaSkin.diagnostics)
})

test("rejects a source model from another game", async () => {
  const conversion = new EtternaToOsuConversion()

  await assert.rejects(() => conversion.convert({ ...etternaSkin, game: "osu" }), /Etterna.*osu/i)
})
