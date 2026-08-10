import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { resolveApplicationRoot } from "../application-root.ts"
import { etternaTemplatesPath, osuTemplatesPath, resolveOsuSkinOutputPath } from "./paths.ts"

test("resolves resources from the application module instead of the working directory", () => {
  assert.equal(
    resolveApplicationRoot("file:///C:/Portable%20App/app.mjs"),
    path.normalize("C:/Portable App"),
  )
})

test("keeps both template roots stable after changing the working directory", () => {
  const expectedSourceRoot = fileURLToPath(new URL("../", import.meta.url))
  const original = process.cwd()
  process.chdir(os.tmpdir())
  try {
    assert.equal(osuTemplatesPath, path.join(expectedSourceRoot, "templates", "osu"))
    assert.equal(etternaTemplatesPath, path.join(expectedSourceRoot, "templates", "etterna"))
  } finally {
    process.chdir(original)
  }
})

test("resolves an osu skin directory from the installation root and the skin name", () => {
  assert.equal(
    resolveOsuSkinOutputPath("Converted Skin", "C:/Games/osu!"),
    path.join("C:/Games/osu!", "Skins", "Converted Skin"),
  )
})

test("rejects skin names that can escape the osu skins directory", () => {
  const osuInstallationDirectory = "C:/Games/osu!"

  for (const skinName of ["", ".", "..", "../Other Skin", "nested/skin", "nested\\skin"]) {
    assert.throws(
      () => resolveOsuSkinOutputPath(skinName, osuInstallationDirectory),
      /unsafe osu! skin name/i,
    )
  }
})

test("rejects a relative osu installation root", () => {
  assert.throws(
    () => resolveOsuSkinOutputPath("Converted Skin", "relative/osu"),
    /absolute osu! installation path/i,
  )
})
