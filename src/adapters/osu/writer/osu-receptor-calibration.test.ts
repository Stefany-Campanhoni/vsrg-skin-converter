import assert from "node:assert/strict"
import test from "node:test"
import {
  getOsuReceptorLogicalVerticalOffset,
  getOsuReceptorVerticalScale,
} from "./osu-receptor-calibration.ts"

test("calculates the calibrated linear receptor scale", () => {
  assert.equal(getOsuReceptorVerticalScale(46), 1)
  assert.equal(getOsuReceptorVerticalScale(62), 196 / 146)
  assert.ok(Math.abs(getOsuReceptorVerticalScale(68) - 859 / 584) < 1e-12)
})

test("rejects a non-positive extrapolated scale", () => {
  assert.throws(() => getOsuReceptorVerticalScale(-1), /positive/)
})

test("provides the calibrated logical receptor offset", () => {
  assert.equal(getOsuReceptorLogicalVerticalOffset(), 23)
})
