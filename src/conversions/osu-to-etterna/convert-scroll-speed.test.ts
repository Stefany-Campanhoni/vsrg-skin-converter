import { expect, test } from "bun:test"
import { getEtternaCmod } from "./convert-scroll-speed.ts"

test("converts ManiaSpeed to Etterna CMod", () => {
  expect(getEtternaCmod(29, 106)).toBe(902)
})

test("rejects non-positive or non-finite ManiaSpeed", () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => getEtternaCmod(invalid, 100)).toThrow(/positive finite ManiaSpeed/i)
  }
})
