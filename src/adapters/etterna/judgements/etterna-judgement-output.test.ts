import { test } from "bun:test"
import assert from "node:assert/strict"
import {
  getEtternaJudgementFilename,
  getEtternaJudgementRelativePath,
} from "./etterna-judgement-output.ts"

test("names standard- and double-resolution Etterna judgement sheets", () => {
  assert.equal(
    getEtternaJudgementFilename("Nekopara", "a0e735211f55dfcd", 1),
    "Nekopara - a0e735211f55dfcd 1x6.png",
  )
  assert.equal(
    getEtternaJudgementFilename("Nekopara", "a0e735211f55dfcd", 2),
    "Nekopara - a0e735211f55dfcd 1x6 (Doubleres).png",
  )
})

test("creates a portable Etterna-relative judgement path", () => {
  assert.equal(
    getEtternaJudgementRelativePath("Nekopara - a0e735211f55dfcd 1x6.png"),
    "Assets/Judgments/Nekopara - a0e735211f55dfcd 1x6.png",
  )
})

test("rejects unsafe skin names, filenames, and malformed profile GUIDs", () => {
  for (const skinName of ["", "../skin", "nested/skin", "CON"]) {
    assert.throws(
      () => getEtternaJudgementFilename(skinName, "a0e735211f55dfcd", 1),
      /unsafe Etterna judgement skin name/i,
    )
  }

  for (const guid of ["A0E735211F55DFCD", "a0e735211f55dfc", "not-a-guid"]) {
    assert.throws(() => getEtternaJudgementFilename("Skin", guid, 1), /Etterna profile GUID/i)
  }

  assert.throws(() => getEtternaJudgementRelativePath("../sheet.png"), /unsafe Etterna/i)
})
