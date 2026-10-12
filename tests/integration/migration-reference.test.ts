import { expect, test } from "bun:test"
import { OsuToEtternaConversion } from "../../src/conversions/osu-to-etterna/osu-to-etterna-conversion.ts"
import type { SkinModel } from "../../src/domain/skin.ts"
import { createReferenceOsuModel } from "../support/migration-source-fixtures.ts"

test("full reverse conversion retains its calibrated values and requires real speed", async () => {
  const complete = createReferenceOsuModel()
  const incomplete = {
    ...complete,
    playfield: { ...complete.playfield, scrollSpeed: undefined },
  } as unknown as SkinModel
  await expect(new OsuToEtternaConversion().convert(incomplete)).rejects.toThrow(/scrollSpeed/)
  const converted = await new OsuToEtternaConversion().convert(complete)
  expect(converted.playfield).toStrictEqual({
    hitPosition: -7,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 106,
    comboScale: 1,
    judgementScale: 1,
    scrollSpeed: 902,
  })
})
