import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveApplicationRoot } from "../application-root.ts"
import { etternaTemplatesPath, osuTemplatesPath, resolveOsuSkinOutputPath } from "./paths.ts"

test("resolves resources from the application module instead of the working directory", () => {
  expect(resolveApplicationRoot("file:///C:/Portable%20App/app.mjs")).toBe(
    path.normalize("C:/Portable App"),
  )
})

test("keeps both template roots stable after changing the working directory", () => {
  const expectedSourceRoot = fileURLToPath(new URL("../", import.meta.url))
  const original = process.cwd()
  process.chdir(os.tmpdir())
  try {
    expect(osuTemplatesPath).toBe(path.join(expectedSourceRoot, "templates", "osu"))
    expect(etternaTemplatesPath).toBe(path.join(expectedSourceRoot, "templates", "etterna"))
  } finally {
    process.chdir(original)
  }
})

test("resolves an osu skin directory from the installation root and the skin name", () => {
  expect(resolveOsuSkinOutputPath("Converted Skin", "C:/Games/osu!")).toBe(
    path.join("C:/Games/osu!", "Skins", "Converted Skin"),
  )
})

test("rejects skin names that can escape the osu skins directory", () => {
  const osuInstallationDirectory = "C:/Games/osu!"

  for (const skinName of ["", ".", "..", "../Other Skin", "nested/skin", "nested\\skin"]) {
    expect(() => resolveOsuSkinOutputPath(skinName, osuInstallationDirectory)).toThrow(
      /unsafe osu! skin name/i,
    )
  }
})

test("rejects a relative osu installation root", () => {
  expect(() => resolveOsuSkinOutputPath("Converted Skin", "relative/osu")).toThrow(
    /absolute osu! installation path/i,
  )
})
