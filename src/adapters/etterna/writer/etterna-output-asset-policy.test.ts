import assert from "node:assert/strict"
import test from "node:test"
import {
  etternaReceptorOutputWidth,
  etternaTapNoteOutputWidth,
  getEtternaOutputAssetFilename,
} from "./etterna-output-asset-policy.ts"

test("decorates an Etterna output asset with a logical height proportional to its image", () => {
  assert.equal(
    getEtternaOutputAssetFilename("_Left Tap Note", { width: 150, height: 75 }),
    "_Left Tap Note (res 64x32).png",
  )
})

test("keeps square Etterna output assets at the standard logical resolution", () => {
  assert.equal(
    getEtternaOutputAssetFilename("_Left Tap Note", { width: 146, height: 146 }),
    "_Left Tap Note (res 64x64).png",
  )
})

test("defines the Etterna tap note output width", () => {
  assert.equal(etternaTapNoteOutputWidth, 150)
})

test("defines the Etterna receptor output width", () => {
  assert.equal(etternaReceptorOutputWidth, 146)
})
