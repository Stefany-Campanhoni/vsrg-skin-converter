import { test } from "bun:test"
import assert from "node:assert/strict"
import { getColumnWidth } from "./convert-column-width.ts"

test("converts and rounds Etterna receptor size to osu column width", () => {
  assert.equal(getColumnWidth(100), 62)
  assert.equal(getColumnWidth(101), 63)
  assert.equal(getColumnWidth(106), 68)
  assert.equal(getColumnWidth(100.5), 63)
})
