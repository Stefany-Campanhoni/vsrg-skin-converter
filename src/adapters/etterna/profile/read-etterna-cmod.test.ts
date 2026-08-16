import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { extractEtternaCmod, readEtternaCmod } from "./read-etterna-cmod.ts"

const profilePath = "C:/Etterna/Save/LocalProfiles/00000001/Etterna.xml"

test("extracts the dance CMod from the DefaultModifiers element", () => {
  assert.equal(
    extractEtternaCmod(
      "<Stats><GeneralData><DefaultModifiers><dance>C888, Reverse, Overhead, Pink</dance></DefaultModifiers></GeneralData></Stats>",
      profilePath,
    ),
    888,
  )
})

test("rejects missing, duplicated, fractional, zero, and negative dance CMods with the profile path", () => {
  for (const source of [
    "<Stats><GeneralData></GeneralData></Stats>",
    "<Stats><DefaultModifiers><dance>C800</dance></DefaultModifiers><DefaultModifiers><dance>C900</dance></DefaultModifiers></Stats>",
    "<Stats><DefaultModifiers><dance>C29.5</dance></DefaultModifiers></Stats>",
    "<Stats><DefaultModifiers><dance>C0</dance></DefaultModifiers></Stats>",
    "<Stats><DefaultModifiers><dance>C-1</dance></DefaultModifiers></Stats>",
  ]) {
    assert.throws(() => extractEtternaCmod(source, profilePath), /Etterna\.xml/i)
  }
})

test("reads the selected profile Etterna.xml", async (context) => {
  const gameRoot = await mkdtemp(path.join(os.tmpdir(), "etterna-cmod-"))
  context.after(() => rm(gameRoot, { recursive: true, force: true }))
  const profileDirectory = path.join(gameRoot, "Save", "LocalProfiles", "selected-profile")
  await mkdir(profileDirectory, { recursive: true })
  await writeFile(
    path.join(profileDirectory, "Etterna.xml"),
    "<Stats><DefaultModifiers><dance>C777, Reverse</dance></DefaultModifiers></Stats>",
  )

  assert.equal(await readEtternaCmod(gameRoot, "selected-profile"), 777)
})
