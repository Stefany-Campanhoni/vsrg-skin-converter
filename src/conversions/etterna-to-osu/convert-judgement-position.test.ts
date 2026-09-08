import { expect, test } from "bun:test"
import { getJudgementPosition } from "./convert-judgement-position.ts"

test("converts Etterna judgement position using game defaults", () => {
  expect(getJudgementPosition(0)).toBe(240)
  expect(getJudgementPosition(4)).toBe(244)
})

test("rounds the converted judgement position to the nearest integer", () => {
  expect(getJudgementPosition(4.4)).toBe(244)
  expect(getJudgementPosition(4.6)).toBe(245)
})
