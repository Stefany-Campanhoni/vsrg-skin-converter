import { expect, test } from "bun:test"
import { getEtternaReceptorSize } from "./convert-receptor-size.ts"

test("converts an osu average column width to an Etterna receptor size", () => {
  expect(getEtternaReceptorSize(69)).toBe(107)
  expect(getEtternaReceptorSize(68.5)).toBe(107)
})

test("rounds an osu average column width before applying the Etterna size offset", () => {
  expect(getEtternaReceptorSize(68.6)).toBe(107)
})
