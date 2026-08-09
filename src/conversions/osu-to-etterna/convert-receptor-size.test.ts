import assert from "node:assert/strict"
import test from "node:test"
import { getEtternaReceptorSize } from "./convert-receptor-size.ts"

test("converts an osu average column width to an Etterna receptor size", () => {
  assert.equal(getEtternaReceptorSize(69), 107)
  assert.equal(getEtternaReceptorSize(68.5), 107)
})

test("rounds an osu average column width before applying the Etterna size offset", () => {
  assert.equal(getEtternaReceptorSize(68.6), 107)
})
