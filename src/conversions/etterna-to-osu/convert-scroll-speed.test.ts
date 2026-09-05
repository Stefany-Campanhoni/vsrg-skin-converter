import { test } from "bun:test"
import assert from "node:assert/strict"
import { getOsuManiaSpeed } from "./convert-scroll-speed.ts"

test("converts Etterna CMod to ManiaSpeed", () => {
  assert.equal(getOsuManiaSpeed(888, 108), 29)
  assert.equal(getOsuManiaSpeed(888, 100), 28)
})

test("rejects non-positive or non-finite CMod", () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => getOsuManiaSpeed(invalid, 100), /positive integer CMod/i)
  }
})

test("rejects a CMod outside the safe-integer range", () => {
  assert.throws(
    () => getOsuManiaSpeed(9_007_199_254_740_992, 100),
    /positive integer CMod.*safe-integer/i,
  )
})

test("rejects a CMod that would round to a non-positive ManiaSpeed", () => {
  assert.throws(
    () => getOsuManiaSpeed(1, 100),
    /CMod 1.*receptor size 100.*positive integer ManiaSpeed/i,
  )
})
