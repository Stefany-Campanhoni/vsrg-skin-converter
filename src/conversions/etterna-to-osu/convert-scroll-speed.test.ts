import { expect, test } from "bun:test"
import { getOsuManiaSpeed } from "./convert-scroll-speed.ts"

test("converts Etterna CMod to ManiaSpeed", () => {
  expect(getOsuManiaSpeed(888, 108)).toBe(29)
  expect(getOsuManiaSpeed(888, 100)).toBe(28)
})

test("rejects non-positive or non-finite CMod", () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => getOsuManiaSpeed(invalid, 100)).toThrow(/positive integer CMod/i)
  }
})

test("rejects a CMod outside the safe-integer range", () => {
  expect(() => getOsuManiaSpeed(9_007_199_254_740_992, 100)).toThrow(
    /positive integer CMod.*safe-integer/i,
  )
})

test("rejects a CMod that would round to a non-positive ManiaSpeed", () => {
  expect(() => getOsuManiaSpeed(1, 100)).toThrow(
    /CMod 1.*receptor size 100.*positive integer ManiaSpeed/i,
  )
})
