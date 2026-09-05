import { onTestFinished, test } from "bun:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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
    "<Stats><DefaultModifiers><dance>C800, C900</dance></DefaultModifiers></Stats>",
    "<Stats><DefaultModifiers><dance>C29.5</dance></DefaultModifiers></Stats>",
    "<Stats><DefaultModifiers><dance>C0</dance></DefaultModifiers></Stats>",
    "<Stats><DefaultModifiers><dance>C-1</dance></DefaultModifiers></Stats>",
  ]) {
    assert.throws(() => extractEtternaCmod(source, profilePath), /Etterna\.xml/i)
  }
})

test("rejects a valid CMod mixed with a malformed CMod candidate", () => {
  assert.throws(
    () =>
      extractEtternaCmod(
        "<Stats><DefaultModifiers><dance>C888, C29.5, Reverse</dance></DefaultModifiers></Stats>",
        profilePath,
      ),
    /CMod.*Etterna\.xml/i,
  )
})

test("rejects a CMod outside the safe-integer range with the profile path", () => {
  assert.throws(
    () =>
      extractEtternaCmod(
        "<Stats><DefaultModifiers><dance>C9007199254740992, Reverse</dance></DefaultModifiers></Stats>",
        profilePath,
      ),
    /positive integer CMod.*safe-integer.*Etterna\.xml/i,
  )
})

test("rejects nested DefaultModifiers and dance elements with the profile path", () => {
  for (const source of [
    "<Stats><DefaultModifiers><DefaultModifiers><dance>C888</dance></DefaultModifiers></DefaultModifiers></Stats>",
    "<Stats><DefaultModifiers><dance>C888<dance>C900</dance></dance></DefaultModifiers></Stats>",
  ]) {
    assert.throws(() => extractEtternaCmod(source, profilePath), /Etterna\.xml/i)
  }
})

test("ignores element-like XML inside comments and reads CMod text from CDATA", () => {
  assert.equal(
    extractEtternaCmod(
      "<Stats><!-- <DefaultModifiers><dance>C800</dance></DefaultModifiers> --><DefaultModifiers><dance><![CDATA[C888, Reverse]]></dance></DefaultModifiers></Stats>",
      profilePath,
    ),
    888,
  )
})

test("reads the selected profile Etterna.xml", async () => {
  const gameRoot = await mkdtemp(path.join(os.tmpdir(), "etterna-cmod-"))
  onTestFinished(() => rm(gameRoot, { recursive: true, force: true }))
  const profileDirectory = path.join(gameRoot, "Save", "LocalProfiles", "selected-profile")
  await mkdir(profileDirectory, { recursive: true })
  await writeFile(
    path.join(profileDirectory, "Etterna.xml"),
    "<Stats><DefaultModifiers><dance>C777, Reverse</dance></DefaultModifiers></Stats>",
  )

  assert.equal(await readEtternaCmod(gameRoot, "selected-profile"), 777)
})
