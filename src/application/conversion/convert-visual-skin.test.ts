import { expect, test } from "bun:test"
import { createReferenceOsuModel } from "../../../tests/support/migration-source-fixtures.ts"
import { OsuToEtternaVisualConversion } from "../../conversions/osu-to-etterna/osu-to-etterna-visual-conversion.ts"
import type { GameId } from "../../domain/game.ts"
import type { VisualSkinExporter } from "../ports/visual-skin-exporter.ts"
import type { VisualSkinReader } from "../ports/visual-skin-reader.ts"
import { convertVisualSkin } from "./convert-visual-skin.ts"
import { VisualConversionRegistry } from "./visual-conversion-registry.ts"

const request = {
  reference: { game: "osu" as const, name: "Reference", sourcePath: "skin", gameRoot: "root" },
  targetGame: "etterna" as const,
}
test("visual operation validates registrations before reading and exports mapped fields", async () => {
  let reads = 0
  const readers = new Map<GameId, VisualSkinReader>([
    [
      "osu",
      {
        game: "osu",
        async readSkin() {
          reads++
          return createReferenceOsuModel()
        },
      },
    ],
  ])
  const exporters = new Map<GameId, VisualSkinExporter>([
    [
      "etterna",
      {
        game: "etterna",
        async exportSkin(skin) {
          return [
            {
              relativePath: "settings.txt",
              contents: new TextEncoder().encode(JSON.stringify(skin.playfield)),
            },
          ]
        },
      },
    ],
  ])
  const conversions = new VisualConversionRegistry([new OsuToEtternaVisualConversion()])
  await expect(
    convertVisualSkin(request, { readers, exporters: new Map(), conversions }),
  ).rejects.toThrow(/exporter/)
  expect(reads).toBe(0)
  const result = await convertVisualSkin(request, { readers, exporters, conversions })
  expect(reads).toBe(1)
  expect(JSON.parse(new TextDecoder().decode(result.files[0]?.contents))).toStrictEqual({
    hitPosition: -7,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 106,
    comboScale: 1,
    judgementScale: 1,
  })
})
test("failed export rejects the whole operation and preserves its failure", async () => {
  const error = new Error("render failed")
  await expect(
    convertVisualSkin(request, {
      readers: new Map([
        [
          "osu",
          {
            game: "osu",
            async readSkin() {
              return createReferenceOsuModel()
            },
          },
        ],
      ]),
      exporters: new Map([
        [
          "etterna",
          {
            game: "etterna",
            async exportSkin() {
              throw error
            },
          },
        ],
      ]),
      conversions: new VisualConversionRegistry([new OsuToEtternaVisualConversion()]),
    }),
  ).rejects.toBe(error)
})
test("visual registry rejects duplicate routes and unavailable conversions", () => {
  expect(
    () =>
      new VisualConversionRegistry([
        new OsuToEtternaVisualConversion(),
        new OsuToEtternaVisualConversion(),
      ]),
  ).toThrow(/Duplicate/)
  expect(() => new VisualConversionRegistry([]).resolve("osu", "etterna")).toThrow(/No conversion/)
})
