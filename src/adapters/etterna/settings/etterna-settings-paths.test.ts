import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import {
  resolveEtternaProfilePath,
  resolveEtternaProfileSettingsPath,
  resolveEtternaThemeSettingsPath,
} from "./etterna-settings-paths.ts"

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
