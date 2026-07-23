import assert from "node:assert/strict"
import test from "node:test"
import { getOsuReceptorVerticalScale } from "./osu-receptor-calibration.ts"

test("calculates the calibrated linear receptor scale", () => {
  assert.equal(getOsuReceptorVerticalScale(46), 1)
  assert.equal(getOsuReceptorVerticalScale(62), 211 / 146)
  assert.ok(Math.abs(getOsuReceptorVerticalScale(68) - 1.6121575342465753) < 1e-12)
})

test("rejects a non-positive extrapolated scale", () => {
  assert.throws(() => getOsuReceptorVerticalScale(10), /positive/)
})
