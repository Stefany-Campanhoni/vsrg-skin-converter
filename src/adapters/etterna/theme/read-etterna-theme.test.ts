import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expectRejectionSatisfies } from "../../../../tests/support/expectations.ts"
import { extractEtternaTheme, readEtternaTheme } from "./read-etterna-theme.ts"

test("uses the configured Etterna theme from Options", () => {
  expect(
    extractEtternaTheme("[Options]\nTheme= Til Death \nDefaultTheme=Rebirth", "Preferences.ini"),
  ).toBe("Til Death")
})

test("falls back to DefaultTheme when Theme is missing or empty", () => {
  expect(extractEtternaTheme("[Options]\nDefaultTheme=Rebirth", "Preferences.ini")).toBe("Rebirth")
  expect(extractEtternaTheme("[Options]\ntheme= \nDefaultTheme=Rebirth", "Preferences.ini")).toBe(
    "Rebirth",
  )
})

test("ignores theme assignments outside Options", () => {
  expect(
    extractEtternaTheme("Theme=Ignored\n[Options]\nDefaultTheme=Rebirth", "Preferences.ini"),
  ).toBe("Rebirth")
})

test("rejects Options without an assigned theme", () => {
  expect(() => extractEtternaTheme("[Options]\nTheme=\nDefaultTheme= ", "Preferences.ini")).toThrow(
    /theme.*Preferences\.ini/i,
  )
})

test("reads the active theme from Preferences.ini", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-theme-"))
  try {
    await mkdir(path.join(root, "Save"), { recursive: true })
    await writeFile(path.join(root, "Save", "Preferences.ini"), "[Options]\nTheme=Custom")

    expect(await readEtternaTheme(root)).toBe("Custom")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("adds the Preferences.ini path and cause when theme reading fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-theme-read-failure-"))
  const preferencesPath = path.join(root, "Save", "Preferences.ini")
  try {
    await expectRejectionSatisfies(
      (() => readEtternaTheme(root))(),
      (error) =>
        error instanceof Error &&
        error.message.includes(preferencesPath) &&
        error.cause instanceof Error,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
