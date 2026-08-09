import assert from "node:assert/strict"
import test from "node:test"
import {
  etternaReceptorOutputSize,
  etternaTapNoteOutputSize,
  getEtternaOutputAssetFilename,
} from "./etterna-output-asset-policy.ts"

test("decorates every Etterna output asset with the fixed logical resolution", () => {
  assert.equal(getEtternaOutputAssetFilename("_Left Tap Note"), "_Left Tap Note (res 64x64).png")
})

test("defines the fixed Etterna tap note output size", () => {
  assert.deepEqual(etternaTapNoteOutputSize, { width: 150, height: 150 })
})

test("defines the fixed Etterna receptor output size", () => {
  assert.deepEqual(etternaReceptorOutputSize, { width: 146, height: 146 })
})
