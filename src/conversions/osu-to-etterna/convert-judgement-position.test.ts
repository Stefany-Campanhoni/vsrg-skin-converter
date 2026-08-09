import assert from "node:assert/strict"
import test from "node:test"
import { getEtternaJudgementPosition } from "./convert-judgement-position.ts"

test("converts osu judgement positions to Etterna coordinates", () => {
  assert.equal(getEtternaJudgementPosition(240), 0)
  assert.equal(getEtternaJudgementPosition(244), 4)
})

test("rounds an osu judgement position before applying the Etterna offset", () => {
  assert.equal(getEtternaJudgementPosition(243.6), 4)
})
