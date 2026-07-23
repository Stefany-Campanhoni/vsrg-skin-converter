import assert from "node:assert/strict"
import test from "node:test"
import type { SkinModel } from "../../domain/skin.ts"
import { ConversionRegistry, type SkinConversion } from "./conversion-registry.ts"

const sourceSkin = {
  game: "etterna",
  metadata: { name: "Fixture" },
  playfield: {
    hitPosition: 0,
    judgementPosition: 0,
    comboPosition: 0,
    columnWidth: 100,
  },
  assets: {
    receptors: undefined,
    tapNotes: undefined,
  },
  diagnostics: [],
} satisfies SkinModel

test("resolves conversions by source and target", async () => {
  const conversion: SkinConversion = {
    source: "etterna",
    target: "osu",
    convert: async (skin) => ({ ...skin, game: "osu" }),
  }
  const registry = new ConversionRegistry([conversion])

  assert.equal(registry.resolve("etterna", "osu"), conversion)
  assert.equal((await conversion.convert(sourceSkin)).game, "osu")
  assert.throws(() => registry.resolve("osu", "etterna"), /osu.*etterna/i)
})

test("rejects duplicate conversion pairs", () => {
  const conversion: SkinConversion = {
    source: "etterna",
    target: "osu",
    convert: async (skin) => ({ ...skin, game: "osu" }),
  }

  assert.throws(() => new ConversionRegistry([conversion, conversion]), /duplicate/i)
})
