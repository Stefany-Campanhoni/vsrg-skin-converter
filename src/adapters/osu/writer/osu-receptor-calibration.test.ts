import { expect, test } from "bun:test"
import { expectTruthy } from "../../../../tests/support/expectations.ts"
import {
  getOsuReceptorLogicalVerticalOffset,
  getOsuReceptorNormalizationSize,
  getOsuReceptorVerticalScale,
} from "./osu-receptor-calibration.ts"

test("calculates the calibrated linear receptor scale", () => {
  expect(getOsuReceptorVerticalScale(46)).toBe(1)
  expect(getOsuReceptorVerticalScale(62)).toBe(196 / 146)
  expectTruthy(Math.abs(getOsuReceptorVerticalScale(68) - 859 / 584) < 1e-12)
})

test("rejects a non-positive extrapolated scale", () => {
  expect(() => getOsuReceptorVerticalScale(-1)).toThrow(/positive/)
})

test("provides the calibrated logical receptor offset", () => {
  expect(getOsuReceptorLogicalVerticalOffset()).toBe(23)
})

test("provides the osu receptor normalization size", () => {
  expect(getOsuReceptorNormalizationSize()).toBe(150)
})
