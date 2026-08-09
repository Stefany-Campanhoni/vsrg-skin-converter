import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { etternaTemplatesPath, osuTemplatesPath, resolveOsuSkinOutputPath } from "./paths.ts"

test("resolves the Etterna template bundle from its game-specific directory", () => {
  assert.equal(etternaTemplatesPath, path.resolve("src", "templates", "etterna"))
})

test("resolves the osu template bundle from its game-specific directory", () => {
  assert.equal(osuTemplatesPath, path.resolve("src", "templates", "osu"))
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
