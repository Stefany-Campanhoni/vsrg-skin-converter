import assert from "node:assert/strict"
import test from "node:test"
import { getEtternaComboPosition } from "./convert-combo-position.ts"

test("converts osu combo positions to Etterna coordinates", () => {
  assert.equal(getEtternaComboPosition(229), 0)
  assert.equal(getEtternaComboPosition(209), -20)
})

test("rounds an osu combo position before applying the Etterna offset", () => {
  assert.equal(getEtternaComboPosition(209.6), -19)
})
