import { test } from "bun:test"
import assert from "node:assert/strict"
import { getHitPosition } from "./convert-hit-position.ts"

test("converts an Etterna hit position with the osu calibration offset", () => {
  assert.equal(getHitPosition(0), 439)
  assert.equal(getHitPosition(-6), 433)
})

test("rounds before applying the hit-position calibration offset", () => {
  assert.equal(getHitPosition(-6.6), 432)
})
