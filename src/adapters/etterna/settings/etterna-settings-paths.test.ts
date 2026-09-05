import { test } from "bun:test"
import assert from "node:assert/strict"
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

  assert.equal(resolveEtternaJudgmentsPath(gameRoot), path.join(gameRoot, "Assets", "Judgments"))
  assert.equal(
    resolveEtternaJudgementPath(gameRoot, "Skin - a0e735211f55dfcd 1x6.png"),
    path.join(gameRoot, "Assets", "Judgments", "Skin - a0e735211f55dfcd 1x6.png"),
  )
})

test("rejects unsafe Etterna judgement filenames", () => {
  for (const filename of ["", "../sheet.png", "nested/sheet.png", "nested\\sheet.png", "CON.png"]) {
    assert.throws(
      () => resolveEtternaJudgementPath("Etterna", filename),
      /unsafe Etterna judgement filename/i,
    )
  }
})

test("resolves an approved NoteSkin name exactly below NoteSkins/dance", () => {
  const gameRoot = path.resolve("Etterna")

  assert.equal(
    resolveEtternaNoteSkinPath(gameRoot, "Converted Skin (osu!)"),
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
    assert.throws(
      () => resolveEtternaNoteSkinPath("Etterna", skinName),
      /unsafe Etterna NoteSkin name/i,
      skinName,
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
    assert.throws(
      () => resolveEtternaNoteSkinPath("Etterna", skinName),
      /unsafe Etterna NoteSkin name/i,
      skinName,
    )
  }
})

test("preserves names neighboring the superscript Windows device aliases", () => {
  for (const skinName of ["COM⁴", "LPT⁴.log", "XCOM¹", "LPT²safe"]) {
    assert.equal(
      resolveEtternaNoteSkinPath("Etterna", skinName),
      path.join("Etterna", "NoteSkins", "dance", skinName),
    )
  }
})

test("resolves Etterna profile and theme settings within the game root", () => {
  const gameRoot = path.resolve("Etterna")

  assert.equal(
    resolveEtternaProfilePath(gameRoot, "00000001"),
    path.join(gameRoot, "Save", "LocalProfiles", "00000001"),
  )
  assert.equal(
    resolveEtternaProfileSettingsPath(gameRoot, "00000001", "Til Death"),
    path.join(gameRoot, "Save", "LocalProfiles", "00000001", "Til Death_settings"),
  )
  assert.equal(
    resolveEtternaThemeSettingsPath(gameRoot, "Til Death"),
    path.join(gameRoot, "Save", "Til Death_settings"),
  )
})

test("rejects profile IDs that are not one directory name", () => {
  for (const profileId of ["", ".", "..", "../outside", "nested/profile", "nested\\profile"]) {
    assert.throws(
      () => resolveEtternaProfilePath("Etterna", profileId),
      /unsafe Etterna profile ID/i,
    )
  }
})

test("rejects theme names that are not one directory name", () => {
  for (const theme of ["", ".", "..", "../outside", "nested/theme", "nested\\theme"]) {
    assert.throws(() => resolveEtternaThemeSettingsPath("Etterna", theme), /unsafe Etterna theme/i)
  }
})
