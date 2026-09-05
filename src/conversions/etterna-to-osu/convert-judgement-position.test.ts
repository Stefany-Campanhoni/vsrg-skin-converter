import { test } from "bun:test"
import assert from "node:assert/strict"
import { getJudgementPosition } from "./convert-judgement-position.ts"

test("converts Etterna judgement position using game defaults", () => {
  assert.equal(getJudgementPosition(0), 240)
  assert.equal(getJudgementPosition(4), 244)
})

test("rounds the converted judgement position to the nearest integer", () => {
  assert.equal(getJudgementPosition(4.4), 244)
  assert.equal(getJudgementPosition(4.6), 245)
})
