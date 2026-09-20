import { expect, onTestFinished, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expectRejectionSatisfies, expectTruthy } from "../../tests/support/expectations.ts"
import { directoryExists, resolveInstallationDirectory } from "./installation-directory.ts"

test("uses the default installation without prompting when it exists", async () => {
  const selected = await resolveInstallationDirectory("C:/Games/Etterna", "missing", {
    directoryExists: async () => true,
    waitForAnyKey: async () =>
      (() => {
        throw new Error("must not wait")
      })(),
    pickDirectory: async () =>
      (() => {
        throw new Error("must not pick")
      })(),
  })

  expect(selected).toBe("C:/Games/Etterna")
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

  expect(selected).toBe("D:/Etterna")
  expect(checkedDirectories).toStrictEqual(["C:/Games/Etterna", "D:/Etterna"])
  expect(prompts).toStrictEqual(["missing"])
})

test("returns undefined when the replacement picker is cancelled", async () => {
  const selected = await resolveInstallationDirectory("C:/Games/Etterna", "missing", {
    directoryExists: async () => false,
    waitForAnyKey: async () => undefined,
    pickDirectory: async () => undefined,
  })

  expect(selected).toBe(undefined)
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

  expect(selected).toBe("D:/Games/osu!")
  expect(checkedDirectories).toStrictEqual(["D:/Games/osu!"])
})

test("accepts directories but rejects files and missing paths", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "installation-directory-"))
  onTestFinished(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const filePath = path.join(temporaryDirectory, "file.txt")
  await writeFile(filePath, "fixture")

  expect(await directoryExists(temporaryDirectory)).toBe(true)
  expect(await directoryExists(filePath)).toBe(false)
  expect(await directoryExists(path.join(temporaryDirectory, "missing"))).toBe(false)
})

test("preserves unexpected filesystem failures with installation context", async () => {
  await expectRejectionSatisfies((() => directoryExists("\0"))(), (error) => {
    expectTruthy(error instanceof Error)
    expect(error.message).toMatch(/could not inspect installation directory/i)
    expectTruthy(error.cause instanceof Error)
    return true
  })
})
