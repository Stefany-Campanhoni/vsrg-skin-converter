import assert from "node:assert/strict"
import { test } from "node:test"
import { getHitPosition } from "./hitposition.ts"

test("converts an Etterna hit position to osu using game defaults", () => {
  assert.equal(getHitPosition(-6), 432)
})

test("rounds the converted osu hit position to the nearest integer", () => {
  assert.equal(getHitPosition(-6.6), 431)
})
