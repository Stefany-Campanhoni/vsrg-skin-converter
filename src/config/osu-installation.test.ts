import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { resolveDefaultOsuInstallationDirectory } from "./osu-installation.ts"

test("resolves the default osu! installation from LOCALAPPDATA", () => {
  assert.equal(
    resolveDefaultOsuInstallationDirectory("C:/Users/Alice/AppData/Local"),
    path.join("C:/Users/Alice/AppData/Local", "osu!"),
  )
})

test("returns no default osu! installation when LOCALAPPDATA is unavailable", () => {
  assert.equal(resolveDefaultOsuInstallationDirectory(undefined), undefined)
  assert.equal(resolveDefaultOsuInstallationDirectory("  "), undefined)
})

test("rejects a relative LOCALAPPDATA root", () => {
  assert.throws(
    () => resolveDefaultOsuInstallationDirectory("relative/local-app-data"),
    /absolute LOCALAPPDATA/i,
  )
})
