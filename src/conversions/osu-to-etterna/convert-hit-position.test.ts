import { expect, test } from "bun:test"
import { getEtternaHitPosition } from "./convert-hit-position.ts"

test("converts osu hit positions to Etterna coordinates", () => {
  expect(getEtternaHitPosition(439)).toBe(0)
  expect(getEtternaHitPosition(432)).toBe(-7)
})

test("rounds an osu hit position before applying the Etterna offset", () => {
  expect(getEtternaHitPosition(432.6)).toBe(-6)
})
