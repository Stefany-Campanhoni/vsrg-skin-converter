import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expectRejectionSatisfies } from "../../../../tests/support/expectations.ts"
import { extractEtternaProfileGuid, readEtternaProfileGuid } from "./read-etterna-profile-guid.ts"

test("extracts the only non-empty Etterna profile GUID", () => {
  expect(
    extractEtternaProfileGuid("<Stats><Guid> a0e735211f55dfcd </Guid></Stats>", "Etterna.xml"),
  ).toBe("a0e735211f55dfcd")
})

test("rejects missing, empty, or multiple GUID values", () => {
  expect(() => extractEtternaProfileGuid("<Stats />", "Etterna.xml")).toThrow(/exactly one.*Guid/i)
  expect(() => extractEtternaProfileGuid("<Guid> </Guid>", "Etterna.xml")).toThrow(
    /non-empty.*Guid/i,
  )
  expect(() =>
    extractEtternaProfileGuid("<Guid>one</Guid><Guid>two</Guid>", "Etterna.xml"),
  ).toThrow(/exactly one.*Guid/i)
})

test("reads profile 00000000 from the Etterna game root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-guid-"))
  try {
    const profileDirectory = path.join(root, "Save", "LocalProfiles", "00000000")
    await mkdir(profileDirectory, { recursive: true })
    await writeFile(path.join(profileDirectory, "Etterna.xml"), "<Guid>fixture-guid</Guid>")

    expect(await readEtternaProfileGuid(root, "00000000")).toBe("fixture-guid")
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

    expect(await readEtternaProfileGuid(root, "selected-profile")).toBe("selected-guid")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("adds the selected Etterna.xml path and cause when GUID reading fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-guid-read-failure-"))
  const profilePath = path.join(root, "Save", "LocalProfiles", "missing-profile", "Etterna.xml")
  try {
    await expectRejectionSatisfies(
      (() => readEtternaProfileGuid(root, "missing-profile"))(),
      (error) =>
        error instanceof Error &&
        error.message.includes(profilePath) &&
        error.cause instanceof Error,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
