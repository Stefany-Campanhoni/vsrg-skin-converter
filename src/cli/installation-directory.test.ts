import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { directoryExists, resolveInstallationDirectory } from "./installation-directory.ts"

test("uses the default installation without prompting when it exists", async () => {
  const selected = await resolveInstallationDirectory("C:/Games/Etterna", "missing", {
    directoryExists: async () => true,
    waitForAnyKey: async () => assert.fail("must not wait"),
    pickDirectory: async () => assert.fail("must not pick"),
  })

  assert.equal(selected, "C:/Games/Etterna")
})

test("returns the selected installation after the default is missing", async () => {
  const checkedDirectories: string[] = []
  const prompts: string[] = []
  const selected = await resolveInstallationDirectory("C:/Games/Etterna", "missing", {
    directoryExists: async (directory) => {
      checkedDirectories.push(directory)
      return directory === "D:/Etterna"
    },
    waitForAnyKey: async (message) => {
      prompts.push(message)
    },
    pickDirectory: async () => "D:/Etterna",
  })

  assert.equal(selected, "D:/Etterna")
  assert.deepEqual(checkedDirectories, ["C:/Games/Etterna", "D:/Etterna"])
  assert.deepEqual(prompts, ["missing"])
})

test("returns undefined when the replacement picker is cancelled", async () => {
  const selected = await resolveInstallationDirectory("C:/Games/Etterna", "missing", {
    directoryExists: async () => false,
    waitForAnyKey: async () => undefined,
    pickDirectory: async () => undefined,
  })

  assert.equal(selected, undefined)
})

test("opens the picker without inspecting an unavailable default", async () => {
  const checkedDirectories: string[] = []
  const selected = await resolveInstallationDirectory(undefined, "missing", {
    directoryExists: async (directory) => {
      checkedDirectories.push(directory)
      return directory === "D:/Games/osu!"
    },
    waitForAnyKey: async () => undefined,
    pickDirectory: async () => "D:/Games/osu!",
  })

  assert.equal(selected, "D:/Games/osu!")
  assert.deepEqual(checkedDirectories, ["D:/Games/osu!"])
})

test("accepts directories but rejects files and missing paths", async (context) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "installation-directory-"))
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const filePath = path.join(temporaryDirectory, "file.txt")
  await writeFile(filePath, "fixture")

  assert.equal(await directoryExists(temporaryDirectory), true)
  assert.equal(await directoryExists(filePath), false)
  assert.equal(await directoryExists(path.join(temporaryDirectory, "missing")), false)
})

test("preserves unexpected filesystem failures with installation context", async () => {
  await assert.rejects(
    () => directoryExists("\0"),
    (error: unknown) => {
      assert(error instanceof Error)
      assert.match(error.message, /could not inspect installation directory/i)
      assert(error.cause instanceof Error)
      return true
    },
  )
})
