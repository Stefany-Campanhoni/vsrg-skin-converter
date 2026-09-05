import { test } from "bun:test"
import assert from "node:assert/strict"
import { getEtternaCmod } from "./convert-scroll-speed.ts"

test("converts ManiaSpeed to Etterna CMod", () => {
  assert.equal(getEtternaCmod(29, 106), 902)
})

test("rejects non-positive or non-finite ManiaSpeed", () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => getEtternaCmod(invalid, 100), /positive finite ManiaSpeed/i)
  }
})
