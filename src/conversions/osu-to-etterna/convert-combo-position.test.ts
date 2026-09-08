import { expect, test } from "bun:test"
import { getEtternaComboPosition } from "./convert-combo-position.ts"

test("converts osu combo positions to Etterna coordinates", () => {
  expect(getEtternaComboPosition(229)).toBe(0)
  expect(getEtternaComboPosition(209)).toBe(-20)
})

test("rounds an osu combo position before applying the Etterna offset", () => {
  expect(getEtternaComboPosition(209.6)).toBe(-19)
})
