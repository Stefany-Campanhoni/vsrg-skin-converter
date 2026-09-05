import { test } from "bun:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseLuaSource } from "../../../infrastructure/lua/parse-lua-source.ts"
import {
  prepareEtternaAssetsConfigUpdate,
  writeEtternaAssetsConfigUpdate,
} from "./prepare-etterna-assets-config-update.ts"

const guid = "a0e735211f55dfcd"
const judgementPath = "Assets/Judgments/Skin - a0e735211f55dfcd 1x6.png"

test("creates a minimal configuration and missing expectation when the file does not exist", async () => {
  const update = await prepareEtternaAssetsConfigUpdate(
    "missing/assetsConfig.lua",
    guid,
    judgementPath,
    {
      readFile: async () => {
        const error = new Error("missing") as NodeJS.ErrnoException
        error.code = "ENOENT"
        throw error
      },
    },
  )

  assert.deepEqual(update.expectation, { state: "missing" })
  assert.equal(
    update.content,
    'return { judgment = { ["a0e735211f55dfcd"] = "Assets/Judgments/Skin - a0e735211f55dfcd 1x6.png" } }\n',
  )
  assert.equal(parseLuaSource(update.content).type, "Chunk")
})

test("inserts into an existing judgment table while preserving every original byte", async () => {
  const source = `-- keep this comment\nreturn {\n  avatar = { default = "avatar.png" },\n  judgment = {\n    -- keep judgment comment\n    default = "Assets/Judgments/default.png",\n  },\n  toasty = { default = "toast.png" },\n}\n`
  const update = await prepareFromSource(source)

  assert.deepEqual(update.expectation, {
    state: "sha256",
    sha256: createHash("sha256").update(Buffer.from(source)).digest("hex"),
  })
  assert.equal(removeInsertedMapping(update.content), source)
  assert.match(update.content, /judgment = \{\n {4}\["a0e735211f55dfcd"\] = ".*",/)
  assert.equal(parseLuaSource(update.content, { ranges: true }).type, "Chunk")
})

test("inserts a judgment table into the returned root without rewriting existing fields", async () => {
  for (const source of [
    "return {}",
    "return { avatar = {}, }",
    "return { -- comment\n avatar = {} }",
  ]) {
    const update = await prepareFromSource(source)

    assert.equal(removeInsertedJudgementTable(update.content), source)
    assert.equal(parseLuaSource(update.content, { ranges: true }).type, "Chunk")
  }
})

test("encodes Lua string literals without emitting raw control characters", async () => {
  const specialPath = 'Assets/Judgments/a"b\\c\nd\re\tf\u0000\u0001.png'
  const update = await prepareEtternaAssetsConfigUpdate("missing.lua", guid, specialPath, {
    readFile: async () => {
      const error = new Error("missing") as NodeJS.ErrnoException
      error.code = "ENOENT"
      throw error
    },
  })

  assert.match(update.content, /a\\"b\\\\c\\nd\\re\\tf\\000\\001\.png/)
  assert.equal(update.content.includes("\u0000"), false)
  assert.equal(update.content.includes("\u0001"), false)
  assert.equal(parseLuaSource(update.content).type, "Chunk")
})

test("rejects malformed or structurally incompatible configurations with file context", async () => {
  const cases = [
    "return {",
    "return {}, {}",
    "return 42",
    "local value = {}; return value",
    "return { judgment = 42 }",
  ]

  for (const source of cases) {
    await assert.rejects(
      () => prepareFromSource(source),
      /assetsConfig\.lua.*(?:parse|return|table|judgment)|(?:parse|return|table|judgment).*assetsConfig\.lua/i,
      source,
    )
  }
})

test("rejects an existing mapping for the allocated GUID", async () => {
  const source = `return { judgment = { ["${guid}"] = "old.png" } }`

  await assert.rejects(
    () => prepareFromSource(source),
    new RegExp(`${guid}.*assetsConfig\\.lua`, "i"),
  )
})

test("retains non-ENOENT read failures as their exact cause", async () => {
  const failure = new Error("access denied")

  await assert.rejects(
    () =>
      prepareEtternaAssetsConfigUpdate("assetsConfig.lua", guid, judgementPath, {
        readFile: async () => {
          throw failure
        },
      }),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /read.*assetsConfig\.lua/i)
      assert.equal(error.cause, failure)
      return true
    },
  )
})

test("writes the exact prepared UTF-8 content and retains write failures", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-assets-config-"))
  const output = path.join(root, "assetsConfig.lua")
  const update = { content: "return {}\n", expectation: { state: "missing" } as const }
  try {
    await writeEtternaAssetsConfigUpdate(output, update)
    assert.equal(await readFile(output, "utf8"), update.content)
  } finally {
    await rm(root, { recursive: true, force: true })
  }

  const failure = new Error("disk full")
  await assert.rejects(
    () =>
      writeEtternaAssetsConfigUpdate("output.lua", update, {
        writeFile: async () => {
          throw failure
        },
      }),
    (error: Error & { cause?: unknown }) => {
      assert.match(error.message, /write.*output\.lua/i)
      assert.equal(error.cause, failure)
      return true
    },
  )
})

async function prepareFromSource(source: string) {
  return prepareEtternaAssetsConfigUpdate(
    "C:/Etterna/Save/Rebirth_settings/assetsConfig.lua",
    guid,
    judgementPath,
    {
      readFile: async () => Buffer.from(source),
    },
  )
}

function removeInsertedMapping(content: string): string {
  return content.replace(`\n    ["${guid}"] = "${judgementPath}",`, "")
}

function removeInsertedJudgementTable(content: string): string {
  return content.replace(`\n  judgment = { ["${guid}"] = "${judgementPath}" },`, "")
}
