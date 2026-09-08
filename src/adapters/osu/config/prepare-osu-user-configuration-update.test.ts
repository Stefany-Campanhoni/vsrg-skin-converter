import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expectRejectionSatisfies, expectTruthy } from "../../../../tests/support/expectations.ts"
import {
  prepareOsuUserConfigurationUpdate,
  writeOsuUserConfigurationUpdate,
} from "./prepare-osu-user-configuration-update.ts"

test("finds the current user's mixed-case CFG and replaces its only ManiaSpeed without changing its formatting", async () => {
  await withOsuRoot(async (osuRoot) => {
    const targetPath = path.join(osuRoot, "OSU!.Stefany.CFG")
    const source = "Username = Stefany\r\n  ManiaSpeed = 10\r\nVolume = 80\r\n"
    await writeFile(targetPath, source)

    const update = await prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", 29)

    expect(update.targetPath).toBe(targetPath)
    expect(update.content).toBe("Username = Stefany\r\n  ManiaSpeed = 29\r\nVolume = 80\r\n")
    expect(update.expectation).toStrictEqual({
      state: "sha256",
      sha256: "5f434779d5a03c89f5c9d90421db54472fc62ef095789c8b183de63d5d4440c2",
    })
  })
})

test("preserves horizontal whitespace after the ManiaSpeed value", async () => {
  await withOsuRoot(async (osuRoot) => {
    const update = await prepareFromSource(osuRoot, "ManiaSpeed = 10   \r\n")

    expect(update.content).toBe("ManiaSpeed = 29   \r\n")
  })
})

test("preserves a UTF-8 byte order mark while updating ManiaSpeed", async () => {
  await withOsuRoot(async (osuRoot) => {
    const update = await prepareFromSource(osuRoot, "\uFEFFManiaSpeed = 10\n")

    expect(update.content).toBe("\uFEFFManiaSpeed = 29\n")
  })
})

test("ignores matching names that are not immediate regular files", async () => {
  const update = await prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
    readDirectory: async () => [
      { name: "OSU!.Stefany.CFG", isFile: () => false },
      { name: "osu!.Stefany.cfg", isFile: () => true },
    ],
    readFile: async () => new TextEncoder().encode("ManiaSpeed=10\n"),
  })

  expect(update.targetPath).toBe(path.join("C:/osu!", "osu!.Stefany.cfg"))
})

test("rejects ambiguous case-insensitive regular CFG matches before opening either file", async () => {
  await expect(
    (() =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => [
          { name: "OSU!.Stefany.CFG", isFile: () => true },
          { name: "osu!.Stefany.cfg", isFile: () => true },
        ],
        readFile: async () => {
          throw new Error("must not read an ambiguous CFG")
        },
      }))(),
  ).rejects.toThrow(/exactly one osu! user configuration.*osu!\.Stefany\.cfg/i)
})

test("rejects CFGs without exactly one ManiaSpeed assignment", async () => {
  await withOsuRoot(async (osuRoot) => {
    const targetPath = path.join(osuRoot, "osu!.Stefany.cfg")
    for (const source of ["Username = Stefany\n", "ManiaSpeed = 10\nManiaSpeed = 11\n"]) {
      await writeFile(targetPath, source)
      await expect(
        (() => prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", 29))(),
      ).rejects.toThrow(/exactly one ManiaSpeed assignment.*osu!\.Stefany\.cfg/i)
    }
  })
})

test("rejects missing or malformed Windows usernames and non-positive integer target speeds", async () => {
  await withOsuRoot(async (osuRoot) => {
    await writeFile(path.join(osuRoot, "osu!.Stefany.cfg"), "ManiaSpeed = 10\n")

    for (const username of [undefined, "", "Stefany\nAdmin"]) {
      await expect(
        (() => prepareOsuUserConfigurationUpdate(osuRoot, username, 29))(),
      ).rejects.toThrow(/Windows username/i)
    }
    for (const maniaSpeed of [0, -1, 29.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        (() => prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", maniaSpeed))(),
      ).rejects.toThrow(/positive integer ManiaSpeed/i)
    }
  })
})

test("explains how to create a missing current-user CFG after discovery or opening", async () => {
  await withOsuRoot(async (osuRoot) => {
    await assertMissingTarget(() => prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", 29))

    await assertMissingTarget(() =>
      prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", 29, {
        readDirectory: async () => [{ name: "osu!.Stefany.cfg", isFile: () => true }],
        readFile: async () => enoent(),
      }),
    )
  })
})

test("wraps directory-listing and CFG-reading failures with their path and cause", async () => {
  const failure = new Error("access denied")

  await expectRejectionSatisfies(
    (() =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => {
          throw failure
        },
        readFile: async () => new TextEncoder().encode(""),
      }))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/list.*C:\/osu!/i)
      expect(error.cause).toBe(failure)
      return true
    },
  )

  await expectRejectionSatisfies(
    (() =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => [{ name: "osu!.Stefany.cfg", isFile: () => true }],
        readFile: async () => {
          throw failure
        },
      }))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/read.*osu!\.Stefany\.cfg/i)
      expect(error.cause).toBe(failure)
      return true
    },
  )
})

test("wraps null and undefined filesystem failures with their path and original cause", async () => {
  await expectRejectionSatisfies(
    (() =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => {
          throw null
        },
        readFile: async () => new TextEncoder().encode(""),
      }))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/list.*C:\/osu!/i)
      expect(error.cause).toBe(null)
      return true
    },
  )

  await expectRejectionSatisfies(
    (() =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => [{ name: "osu!.Stefany.cfg", isFile: () => true }],
        readFile: async () => {
          throw undefined
        },
      }))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/read.*osu!\.Stefany\.cfg/i)
      expect(error.cause).toBe(undefined)
      return true
    },
  )
})

test("writes the prepared UTF-8 content and wraps write failures with their output path", async () => {
  await withOsuRoot(async (osuRoot) => {
    const update = await prepareFromSource(osuRoot, "ManiaSpeed = 10\n")
    const outputFile = path.join(osuRoot, "staged.cfg")
    await writeOsuUserConfigurationUpdate(outputFile, update)
    expect(await readFile(outputFile, "utf8")).toBe("ManiaSpeed = 29\n")
  })

  const failure = new Error("disk full")
  const update = {
    targetPath: "C:/osu!/osu!.Stefany.cfg",
    content: "ManiaSpeed = 29\n",
    expectation: { state: "sha256", sha256: "a".repeat(64) } as const,
  }
  await expectRejectionSatisfies(
    (() =>
      writeOsuUserConfigurationUpdate("C:/staging/osu!.Stefany.cfg", update, {
        writeFile: async () => {
          throw failure
        },
      }))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/write.*C:\/staging\/osu!\.Stefany\.cfg/i)
      expect(error.cause).toBe(failure)
      return true
    },
  )
})

async function prepareFromSource(osuRoot: string, source: string) {
  await writeFile(path.join(osuRoot, "osu!.Stefany.cfg"), source)
  return prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", 29)
}

async function assertMissingTarget(action: () => Promise<unknown>): Promise<void> {
  await expectRejectionSatisfies(action, (error) => {
    expectTruthy(error instanceof Error)
    expect(error.message).toMatch(/Stefany/)
    expect(error.message).toMatch(/osu!\.Stefany\.cfg/i)
    expect(error.message).toMatch(/start osu! at least once/i)
    return true
  })
}

function enoent(): never {
  const error = new Error("missing") as NodeJS.ErrnoException
  error.code = "ENOENT"
  throw error
}

async function withOsuRoot(action: (osuRoot: string) => Promise<void>): Promise<void> {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-config-update-"))
  try {
    await action(osuRoot)
  } finally {
    await rm(osuRoot, { recursive: true, force: true })
  }
}
