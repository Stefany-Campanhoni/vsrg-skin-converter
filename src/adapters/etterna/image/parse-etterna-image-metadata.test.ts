import { test } from "bun:test"
import assert from "node:assert/strict"
import { parseEtternaImageMetadata } from "./parse-etterna-image-metadata.ts"

test("parses Etterna layout and double-resolution decorations", () => {
  assert.deepEqual(parseEtternaImageMetadata("Judgment Normal 2x6 (Doubleres)"), {
    logicalStem: "Judgment Normal",
    columns: 2,
    rows: 6,
    doubleResolution: true,
  })
  assert.deepEqual(parseEtternaImageMetadata("default 1X6 (doubleres)"), {
    logicalStem: "default",
    columns: 1,
    rows: 6,
    doubleResolution: true,
  })
})

test("preserves undecorated and res-decorated filename behavior", () => {
  assert.deepEqual(parseEtternaImageMetadata("Tap Note"), {
    logicalStem: "Tap Note",
    columns: 1,
    rows: 1,
    doubleResolution: false,
  })
  assert.deepEqual(parseEtternaImageMetadata("Tap Note 3x8 (res 64x64)"), {
    logicalStem: "Tap Note",
    columns: 3,
    rows: 8,
    doubleResolution: false,
  })
})
