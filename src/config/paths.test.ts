import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { resolveOsuSkinOutputPath } from "./paths.ts"

test("resolves an osu skin directory from LOCALAPPDATA and the skin name", () => {
  assert.equal(
    resolveOsuSkinOutputPath("Converted Skin", "C:/Users/Alice/AppData/Local"),
    path.join("C:/Users/Alice/AppData/Local", "osu!", "Skins", "Converted Skin"),
  )
})

test("rejects a missing LOCALAPPDATA value", () => {
  assert.throws(() => resolveOsuSkinOutputPath("Converted Skin", undefined), /LOCALAPPDATA/i)
})

test("rejects skin names that can escape the osu skins directory", () => {
  const localAppData = "C:/Users/Alice/AppData/Local"

  for (const skinName of ["", ".", "..", "../Other Skin", "nested/skin", "nested\\skin"]) {
    assert.throws(() => resolveOsuSkinOutputPath(skinName, localAppData), /unsafe osu! skin name/i)
  }
})

test("rejects a relative LOCALAPPDATA root", () => {
  assert.throws(
    () => resolveOsuSkinOutputPath("Converted Skin", "relative/local-app-data"),
    /absolute LOCALAPPDATA/i,
  )
})
