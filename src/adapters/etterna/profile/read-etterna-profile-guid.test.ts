import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
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

    assert.equal(await readEtternaProfileGuid(root), "fixture-guid")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
