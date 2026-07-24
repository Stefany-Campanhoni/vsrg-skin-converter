import assert from "node:assert/strict"
import test from "node:test"
import { getComboPosition } from "./convert-combo-position.ts"

test("converts Etterna combo position using game defaults", () => {
  assert.equal(getComboPosition(0), 230)
  assert.equal(getComboPosition(-20), 210)
})

test("rounds the converted combo position to the nearest integer", () => {
  assert.equal(getComboPosition(-20.4), 210)
  assert.equal(getComboPosition(-20.6), 209)
})
