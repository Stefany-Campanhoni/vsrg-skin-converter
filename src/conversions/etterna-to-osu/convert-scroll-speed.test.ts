import assert from "node:assert/strict"
import test from "node:test"
import { getOsuManiaSpeed } from "./convert-scroll-speed.ts"

test("converts Etterna CMod to ManiaSpeed", () => {
  assert.equal(getOsuManiaSpeed(888, 108), 29)
})

test("rejects non-positive or non-finite CMod", () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => getOsuManiaSpeed(invalid, 100), /positive integer CMod/i)
  }
})
