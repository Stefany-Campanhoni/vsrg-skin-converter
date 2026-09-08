import { expect, test } from "bun:test"
import {
  getEtternaJudgementFilename,
  getEtternaJudgementRelativePath,
} from "./etterna-judgement-output.ts"

test("names standard- and double-resolution Etterna judgement sheets", () => {
  expect(getEtternaJudgementFilename("Nekopara", "a0e735211f55dfcd", 1)).toBe(
    "Nekopara - a0e735211f55dfcd 1x6.png",
  )
  expect(getEtternaJudgementFilename("Nekopara", "a0e735211f55dfcd", 2)).toBe(
    "Nekopara - a0e735211f55dfcd 1x6 (Doubleres).png",
  )
})

test("creates a portable Etterna-relative judgement path", () => {
  expect(getEtternaJudgementRelativePath("Nekopara - a0e735211f55dfcd 1x6.png")).toBe(
    "Assets/Judgments/Nekopara - a0e735211f55dfcd 1x6.png",
  )
})

test("rejects unsafe skin names, filenames, and malformed profile GUIDs", () => {
  for (const skinName of ["", "../skin", "nested/skin", "CON"]) {
    expect(() => getEtternaJudgementFilename(skinName, "a0e735211f55dfcd", 1)).toThrow(
      /unsafe Etterna judgement skin name/i,
    )
  }

  for (const guid of ["A0E735211F55DFCD", "a0e735211f55dfc", "not-a-guid"]) {
    expect(() => getEtternaJudgementFilename("Skin", guid, 1)).toThrow(/Etterna profile GUID/i)
  }

  expect(() => getEtternaJudgementRelativePath("../sheet.png")).toThrow(/unsafe Etterna/i)
})
