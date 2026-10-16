import { expect, test } from "bun:test"
import { createReferenceOsuModel } from "../../../tests/support/migration-source-fixtures.ts"
import { EtternaToOsuVisualConversion } from "../etterna-to-osu/etterna-to-osu-visual-conversion.ts"
import { OsuToEtternaVisualConversion } from "./osu-to-etterna-visual-conversion.ts"

test("reverse visual migration maps positions without inventing or leaking speed", async () => {
  const source = createReferenceOsuModel()
  const result = await new OsuToEtternaVisualConversion().convert(source)
  expect(result.playfield).toStrictEqual({
    hitPosition: -7,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 106,
    comboScale: 1,
    judgementScale: 1,
  })
  expect(Object.hasOwn(result.playfield, "scrollSpeed")).toBe(false)
  expect(result.assets).toBe(source.assets)
})
test("forward visual migration retains calibrated rounding and scales", async () => {
  const result = await new EtternaToOsuVisualConversion().convert({
    ...createReferenceOsuModel(),
    game: "etterna",
    playfield: {
      hitPosition: -6.6,
      judgementPosition: 4,
      comboPosition: -20,
      columnWidth: 108,
      comboScale: 0.6,
      judgementScale: 0.675,
    },
  })
  expect(result.playfield).toStrictEqual({
    hitPosition: 432,
    judgementPosition: 244,
    comboPosition: 209,
    columnWidth: 70,
    comboScale: 0.6,
    judgementScale: 0.675,
  })
})
test("visual migration rejects the wrong source game and nonfinite required fields", async () => {
  await expect(
    new EtternaToOsuVisualConversion().convert(createReferenceOsuModel()),
  ).rejects.toThrow(/cannot convert/)
  await expect(
    new OsuToEtternaVisualConversion().convert({
      ...createReferenceOsuModel(),
      playfield: { ...createReferenceOsuModel().playfield, hitPosition: Number.NaN },
    }),
  ).rejects.toThrow(/hitPosition/)
})
