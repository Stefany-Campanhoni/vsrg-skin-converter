import assert from "node:assert/strict"
import test from "node:test"
import { getEtternaHitPosition } from "./convert-hit-position.ts"

test("converts osu hit positions to Etterna coordinates", () => {
  assert.equal(getEtternaHitPosition(439), 0)
  assert.equal(getEtternaHitPosition(432), -7)
})

test("rounds an osu hit position before applying the Etterna offset", () => {
  assert.equal(getEtternaHitPosition(432.6), -6)
})
