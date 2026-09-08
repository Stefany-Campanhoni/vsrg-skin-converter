import { expect, test } from "bun:test"
import {
  etternaReceptorOutputWidth,
  etternaTapNoteOutputWidth,
  getEtternaOutputAssetFilename,
  getEtternaReceptorOutputDimensions,
} from "./etterna-output-asset-policy.ts"

test("decorates an Etterna output asset with a logical height proportional to its image", () => {
  expect(getEtternaOutputAssetFilename("_Left Tap Note", { width: 150, height: 75 })).toBe(
    "_Left Tap Note (res 64x32).png",
  )
})

test("keeps square Etterna output assets at the standard logical resolution", () => {
  expect(getEtternaOutputAssetFilename("_Left Tap Note", { width: 146, height: 146 })).toBe(
    "_Left Tap Note (res 64x64).png",
  )
})

test("defines the Etterna tap note output width", () => {
  expect(etternaTapNoteOutputWidth).toBe(150)
})

test("defines the Etterna receptor output width", () => {
  expect(etternaReceptorOutputWidth).toBe(146)
})

test("derives exact receptor dimensions from the matching note proportions", () => {
  expect(getEtternaReceptorOutputDimensions({ width: 100, height: 100 })).toStrictEqual({
    width: 146,
    height: 146,
  })
  expect(getEtternaReceptorOutputDimensions({ width: 100, height: 50 })).toStrictEqual({
    width: 146,
    height: 73,
  })
  expect(getEtternaReceptorOutputDimensions({ width: 100, height: 150 })).toStrictEqual({
    width: 146,
    height: 219,
  })
})
