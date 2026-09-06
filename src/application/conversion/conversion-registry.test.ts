import { expect, test } from "bun:test"
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
    comboScale: 1,
    judgementScale: 1,
    scrollSpeed: 1,
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

  expect(registry.resolve("etterna", "osu")).toBe(conversion)
  expect((await conversion.convert(sourceSkin)).game).toBe("osu")
  expect(() => registry.resolve("osu", "etterna")).toThrow(/osu.*etterna/i)
})

test("rejects duplicate conversion pairs", () => {
  const conversion: SkinConversion = {
    source: "etterna",
    target: "osu",
    convert: async (skin) => ({ ...skin, game: "osu" }),
  }

  expect(() => new ConversionRegistry([conversion, conversion])).toThrow(/duplicate/i)
})
