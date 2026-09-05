import { test } from "bun:test"
import assert from "node:assert/strict"
import { getComboPosition } from "./convert-combo-position.ts"

test("converts Etterna combo position with the osu calibration offset", () => {
  assert.equal(getComboPosition(0), 229)
  assert.equal(getComboPosition(-20), 209)
})

test("rounds before applying the combo calibration offset", () => {
  assert.equal(getComboPosition(-20.4), 209)
  assert.equal(getComboPosition(-20.6), 208)
})
