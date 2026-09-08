import { expect, test } from "bun:test"
import path from "node:path"
import {
  resolveEtternaJudgementPath,
  resolveEtternaJudgmentsPath,
  resolveEtternaNoteSkinPath,
  resolveEtternaProfilePath,
  resolveEtternaProfileSettingsPath,
  resolveEtternaThemeSettingsPath,
} from "./etterna-settings-paths.ts"

test("resolves Etterna judgement assets as direct children of Assets/Judgments", () => {
  const gameRoot = path.resolve("Etterna")

  expect(resolveEtternaJudgmentsPath(gameRoot)).toBe(path.join(gameRoot, "Assets", "Judgments"))
  expect(resolveEtternaJudgementPath(gameRoot, "Skin - a0e735211f55dfcd 1x6.png")).toBe(
    path.join(gameRoot, "Assets", "Judgments", "Skin - a0e735211f55dfcd 1x6.png"),
  )
})

test("rejects unsafe Etterna judgement filenames", () => {
  for (const filename of ["", "../sheet.png", "nested/sheet.png", "nested\\sheet.png", "CON.png"]) {
    expect(() => resolveEtternaJudgementPath("Etterna", filename)).toThrow(
      /unsafe Etterna judgement filename/i,
    )
  }
})

test("resolves an approved NoteSkin name exactly below NoteSkins/dance", () => {
  const gameRoot = path.resolve("Etterna")

  expect(resolveEtternaNoteSkinPath(gameRoot, "Converted Skin (osu!)")).toBe(
    path.join(gameRoot, "NoteSkins", "dance", "Converted Skin (osu!)"),
  )
})

test("rejects unsafe Windows NoteSkin directory names instead of sanitizing them", () => {
  const unsafeNames = [
    "",
    " ",
    ".",
    "..",
    path.resolve("outside"),
    "nested/skin",
    "nested\\skin",
    "bad<skin",
    "bad>skin",
    'bad"skin',
    "bad:skin",
    "bad|skin",
    "bad?skin",
    "bad*skin",
    "bad\0skin",
    "CON",
    "con.txt",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM9.ini",
    "LPT1",
    "LPT9.log",
    "trailing.",
    "trailing ",
  ]

  for (const skinName of unsafeNames) {
    expect(() => resolveEtternaNoteSkinPath("Etterna", skinName), skinName).toThrow(
      /unsafe Etterna NoteSkin name/i,
    )
  }
})

test("rejects every superscript Windows COM and LPT device alias with optional extensions", () => {
  const reservedNames = [
    "COM¹",
    "com¹.txt",
    "CoM²",
    "cOm².ini",
    "COM³",
    "com³.log",
    "LPT¹",
    "lpt¹.txt",
    "LpT²",
    "lPt².log",
    "LPT³",
    "lpt³.ini",
  ]

  for (const skinName of reservedNames) {
    expect(() => resolveEtternaNoteSkinPath("Etterna", skinName), skinName).toThrow(
      /unsafe Etterna NoteSkin name/i,
    )
  }
})

test("preserves names neighboring the superscript Windows device aliases", () => {
  for (const skinName of ["COM⁴", "LPT⁴.log", "XCOM¹", "LPT²safe"]) {
    expect(resolveEtternaNoteSkinPath("Etterna", skinName)).toBe(
      path.join("Etterna", "NoteSkins", "dance", skinName),
    )
  }
})

test("resolves Etterna profile and theme settings within the game root", () => {
  const gameRoot = path.resolve("Etterna")

  expect(resolveEtternaProfilePath(gameRoot, "00000001")).toBe(
    path.join(gameRoot, "Save", "LocalProfiles", "00000001"),
  )
  expect(resolveEtternaProfileSettingsPath(gameRoot, "00000001", "Til Death")).toBe(
    path.join(gameRoot, "Save", "LocalProfiles", "00000001", "Til Death_settings"),
  )
  expect(resolveEtternaThemeSettingsPath(gameRoot, "Til Death")).toBe(
    path.join(gameRoot, "Save", "Til Death_settings"),
  )
})

test("rejects profile IDs that are not one directory name", () => {
  for (const profileId of ["", ".", "..", "../outside", "nested/profile", "nested\\profile"]) {
    expect(() => resolveEtternaProfilePath("Etterna", profileId)).toThrow(
      /unsafe Etterna profile ID/i,
    )
  }
})

test("rejects theme names that are not one directory name", () => {
  for (const theme of ["", ".", "..", "../outside", "nested/theme", "nested\\theme"]) {
    expect(() => resolveEtternaThemeSettingsPath("Etterna", theme)).toThrow(/unsafe Etterna theme/i)
  }
})
