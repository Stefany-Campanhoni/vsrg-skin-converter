import { expect, test } from "bun:test"
import { getComboPosition } from "./convert-combo-position.ts"

test("converts Etterna combo position with the osu calibration offset", () => {
  expect(getComboPosition(0)).toBe(229)
  expect(getComboPosition(-20)).toBe(209)
})

test("rounds before applying the combo calibration offset", () => {
  expect(getComboPosition(-20.4)).toBe(209)
  expect(getComboPosition(-20.6)).toBe(208)
})
