import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { extractEtternaTheme, readEtternaTheme } from "./read-etterna-theme.ts"

test("uses the configured Etterna theme from Options", () => {
  assert.equal(
    extractEtternaTheme("[Options]\nTheme= Til Death \nDefaultTheme=Rebirth", "Preferences.ini"),
    "Til Death",
  )
})

test("falls back to DefaultTheme when Theme is missing or empty", () => {
  assert.equal(extractEtternaTheme("[Options]\nDefaultTheme=Rebirth", "Preferences.ini"), "Rebirth")
  assert.equal(
    extractEtternaTheme("[Options]\ntheme= \nDefaultTheme=Rebirth", "Preferences.ini"),
    "Rebirth",
  )
})

test("ignores theme assignments outside Options", () => {
  assert.equal(
    extractEtternaTheme("Theme=Ignored\n[Options]\nDefaultTheme=Rebirth", "Preferences.ini"),
    "Rebirth",
  )
})

test("rejects Options without an assigned theme", () => {
  assert.throws(
    () => extractEtternaTheme("[Options]\nTheme=\nDefaultTheme= ", "Preferences.ini"),
    /theme.*Preferences\.ini/i,
  )
})

test("reads the active theme from Preferences.ini", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-theme-"))
  try {
    await mkdir(path.join(root, "Save"), { recursive: true })
    await writeFile(path.join(root, "Save", "Preferences.ini"), "[Options]\nTheme=Custom")

    assert.equal(await readEtternaTheme(root), "Custom")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("adds the Preferences.ini path and cause when theme reading fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-theme-read-failure-"))
  const preferencesPath = path.join(root, "Save", "Preferences.ini")
  try {
    await assert.rejects(
      () => readEtternaTheme(root),
      (error) =>
        error instanceof Error &&
        error.message.includes(preferencesPath) &&
        error.cause instanceof Error,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
