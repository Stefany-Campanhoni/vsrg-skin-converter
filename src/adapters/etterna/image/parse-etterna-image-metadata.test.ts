import { expect, test } from "bun:test"
import { parseEtternaImageMetadata } from "./parse-etterna-image-metadata.ts"

test("parses Etterna layout and double-resolution decorations", () => {
  expect(parseEtternaImageMetadata("Judgment Normal 2x6 (Doubleres)")).toStrictEqual({
    logicalStem: "Judgment Normal",
    columns: 2,
    rows: 6,
    doubleResolution: true,
  })
  expect(parseEtternaImageMetadata("default 1X6 (doubleres)")).toStrictEqual({
    logicalStem: "default",
    columns: 1,
    rows: 6,
    doubleResolution: true,
  })
})

test("preserves undecorated and res-decorated filename behavior", () => {
  expect(parseEtternaImageMetadata("Tap Note")).toStrictEqual({
    logicalStem: "Tap Note",
    columns: 1,
    rows: 1,
    doubleResolution: false,
  })
  expect(parseEtternaImageMetadata("Tap Note 3x8 (res 64x64)")).toStrictEqual({
    logicalStem: "Tap Note",
    columns: 3,
    rows: 8,
    doubleResolution: false,
  })
})
