import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
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

    assert.equal(update.targetPath, targetPath)
    assert.equal(update.content, "Username = Stefany\r\n  ManiaSpeed = 29\r\nVolume = 80\r\n")
    assert.deepEqual(update.expectation, {
      state: "sha256",
      sha256: createHash("sha256").update(Buffer.from(source)).digest("hex"),
    })
  })
})

test("ignores matching names that are not immediate regular files", async () => {
  const update = await prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
    readDirectory: async () => [
      { name: "OSU!.Stefany.CFG", isFile: () => false },
      { name: "osu!.Stefany.cfg", isFile: () => true },
    ],
    readFile: async () => Buffer.from("ManiaSpeed=10\n"),
  })

  assert.equal(update.targetPath, path.join("C:/osu!", "osu!.Stefany.cfg"))
})

test("rejects ambiguous case-insensitive regular CFG matches before opening either file", async () => {
  await assert.rejects(
    () =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => [
          { name: "OSU!.Stefany.CFG", isFile: () => true },
          { name: "osu!.Stefany.cfg", isFile: () => true },
        ],
        readFile: async () => {
          throw new Error("must not read an ambiguous CFG")
        },
      }),
    /exactly one osu! user configuration.*osu!\.Stefany\.cfg/i,
  )
})

test("rejects CFGs without exactly one ManiaSpeed assignment", async () => {
  await withOsuRoot(async (osuRoot) => {
    const targetPath = path.join(osuRoot, "osu!.Stefany.cfg")
    for (const source of ["Username = Stefany\n", "ManiaSpeed = 10\nManiaSpeed = 11\n"]) {
      await writeFile(targetPath, source)
      await assert.rejects(
        () => prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", 29),
        /exactly one ManiaSpeed assignment.*osu!\.Stefany\.cfg/i,
      )
    }
  })
})

test("rejects missing or malformed Windows usernames and non-positive integer target speeds", async () => {
  await withOsuRoot(async (osuRoot) => {
    await writeFile(path.join(osuRoot, "osu!.Stefany.cfg"), "ManiaSpeed = 10\n")

    for (const username of [undefined, "", "Stefany\nAdmin"]) {
      await assert.rejects(
        () => prepareOsuUserConfigurationUpdate(osuRoot, username, 29),
        /Windows username/i,
      )
    }
    for (const maniaSpeed of [0, -1, 29.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await assert.rejects(
        () => prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", maniaSpeed),
        /positive integer ManiaSpeed/i,
      )
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

  await assert.rejects(
    () =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => {
          throw failure
        },
        readFile: async () => Buffer.from(""),
      }),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /list.*C:\/osu!/i)
      assert.equal(error.cause, failure)
      return true
    },
  )

  await assert.rejects(
    () =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => [{ name: "osu!.Stefany.cfg", isFile: () => true }],
        readFile: async () => {
          throw failure
        },
      }),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /read.*osu!\.Stefany\.cfg/i)
      assert.equal(error.cause, failure)
      return true
    },
  )
})

test("wraps null and undefined filesystem failures with their path and original cause", async () => {
  await assert.rejects(
    () =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => {
          throw null
        },
        readFile: async () => Buffer.from(""),
      }),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /list.*C:\/osu!/i)
      assert.equal(error.cause, null)
      return true
    },
  )

  await assert.rejects(
    () =>
      prepareOsuUserConfigurationUpdate("C:/osu!", "Stefany", 29, {
        readDirectory: async () => [{ name: "osu!.Stefany.cfg", isFile: () => true }],
        readFile: async () => {
          throw undefined
        },
      }),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /read.*osu!\.Stefany\.cfg/i)
      assert.equal(error.cause, undefined)
      return true
    },
  )
})

test("writes the prepared UTF-8 content and wraps write failures with their output path", async () => {
  await withOsuRoot(async (osuRoot) => {
    const update = await prepareFromSource(osuRoot, "ManiaSpeed = 10\n")
    const outputFile = path.join(osuRoot, "staged.cfg")
    await writeOsuUserConfigurationUpdate(outputFile, update)
    assert.equal(await readFile(outputFile, "utf8"), "ManiaSpeed = 29\n")
  })

  const failure = new Error("disk full")
  const update = {
    targetPath: "C:/osu!/osu!.Stefany.cfg",
    content: "ManiaSpeed = 29\n",
    expectation: { state: "sha256", sha256: "a".repeat(64) } as const,
  }
  await assert.rejects(
    () =>
      writeOsuUserConfigurationUpdate("C:/staging/osu!.Stefany.cfg", update, {
        writeFile: async () => {
          throw failure
        },
      }),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /write.*C:\/staging\/osu!\.Stefany\.cfg/i)
      assert.equal(error.cause, failure)
      return true
    },
  )
})

async function prepareFromSource(osuRoot: string, source: string) {
  await writeFile(path.join(osuRoot, "osu!.Stefany.cfg"), source)
  return prepareOsuUserConfigurationUpdate(osuRoot, "Stefany", 29)
}

async function assertMissingTarget(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(action, (error: Error) => {
    assert.match(error.message, /Stefany/)
    assert.match(error.message, /osu!\.Stefany\.cfg/i)
    assert.match(error.message, /start osu! at least once/i)
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
