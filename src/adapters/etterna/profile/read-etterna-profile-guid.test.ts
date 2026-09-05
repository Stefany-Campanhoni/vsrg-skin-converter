import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { extractEtternaProfileGuid, readEtternaProfileGuid } from "./read-etterna-profile-guid.ts"

test("extracts the only non-empty Etterna profile GUID", () => {
  assert.equal(
    extractEtternaProfileGuid("<Stats><Guid> a0e735211f55dfcd </Guid></Stats>", "Etterna.xml"),
    "a0e735211f55dfcd",
  )
})

test("rejects missing, empty, or multiple GUID values", () => {
  assert.throws(() => extractEtternaProfileGuid("<Stats />", "Etterna.xml"), /exactly one.*Guid/i)
  assert.throws(
    () => extractEtternaProfileGuid("<Guid> </Guid>", "Etterna.xml"),
    /non-empty.*Guid/i,
  )
  assert.throws(
    () => extractEtternaProfileGuid("<Guid>one</Guid><Guid>two</Guid>", "Etterna.xml"),
    /exactly one.*Guid/i,
  )
})

test("reads profile 00000000 from the Etterna game root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-guid-"))
  try {
    const profileDirectory = path.join(root, "Save", "LocalProfiles", "00000000")
    await mkdir(profileDirectory, { recursive: true })
    await writeFile(path.join(profileDirectory, "Etterna.xml"), "<Guid>fixture-guid</Guid>")

    assert.equal(await readEtternaProfileGuid(root, "00000000"), "fixture-guid")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("reads the GUID from the requested Etterna profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-selected-guid-"))
  try {
    const profileDirectory = path.join(root, "Save", "LocalProfiles", "selected-profile")
    await mkdir(profileDirectory, { recursive: true })
    await writeFile(path.join(profileDirectory, "Etterna.xml"), "<Guid>selected-guid</Guid>")

    assert.equal(await readEtternaProfileGuid(root, "selected-profile"), "selected-guid")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("adds the selected Etterna.xml path and cause when GUID reading fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-guid-read-failure-"))
  const profilePath = path.join(root, "Save", "LocalProfiles", "missing-profile", "Etterna.xml")
  try {
    await assert.rejects(
      () => readEtternaProfileGuid(root, "missing-profile"),
      (error) =>
        error instanceof Error &&
        error.message.includes(profilePath) &&
        error.cause instanceof Error,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
