import { expect, test } from "bun:test"
import { getEtternaJudgementPosition } from "./convert-judgement-position.ts"

test("converts osu judgement positions to Etterna coordinates", () => {
  expect(getEtternaJudgementPosition(240)).toBe(0)
  expect(getEtternaJudgementPosition(244)).toBe(4)
})

test("rounds an osu judgement position before applying the Etterna offset", () => {
  expect(getEtternaJudgementPosition(243.6)).toBe(4)
})
