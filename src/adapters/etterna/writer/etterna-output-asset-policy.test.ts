import assert from "node:assert/strict"
import test from "node:test"
import {
  etternaReceptorOutputHeight,
  etternaTapNoteOutputHeight,
  getEtternaOutputAssetFilename,
} from "./etterna-output-asset-policy.ts"

test("decorates every Etterna output asset with the fixed logical resolution", () => {
  assert.equal(getEtternaOutputAssetFilename("_Left Tap Note"), "_Left Tap Note (res 64x64).png")
})

test("defines the Etterna tap note output height", () => {
  assert.equal(etternaTapNoteOutputHeight, 150)
})

test("defines the Etterna receptor output height", () => {
  assert.equal(etternaReceptorOutputHeight, 146)
})
