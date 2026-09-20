import { expect, test } from "bun:test"
import { getColumnWidth } from "./convert-column-width.ts"

test("converts and rounds Etterna receptor size to osu column width", () => {
  expect(getColumnWidth(100)).toBe(62)
  expect(getColumnWidth(101)).toBe(63)
  expect(getColumnWidth(106)).toBe(68)
  expect(getColumnWidth(100.5)).toBe(63)
})
