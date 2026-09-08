import { expect, test } from "bun:test"
import { getHitPosition } from "./convert-hit-position.ts"

test("converts an Etterna hit position with the osu calibration offset", () => {
  expect(getHitPosition(0)).toBe(439)
  expect(getHitPosition(-6)).toBe(433)
})

test("rounds before applying the hit-position calibration offset", () => {
  expect(getHitPosition(-6.6)).toBe(432)
})
