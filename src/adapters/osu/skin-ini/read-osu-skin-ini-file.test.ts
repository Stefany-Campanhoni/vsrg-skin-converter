import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { readOsuSkinIniFile } from "./read-osu-skin-ini-file.ts"

const source = "[General]\nName: Café\n"

test("decodes a UTF-8 osu skin.ini with a byte order mark", async (context) => {
  const filePath = await createSkinIni(
    context,
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(source, "utf8")]),
  )

  assert.equal(await readOsuSkinIniFile(filePath), source)
})

test("rejects null characters in a UTF-8 osu skin.ini", async (context) => {
  const sourceWithNull = "[General]\nName: Café\nUnused: \0"
  const filePath = await createSkinIni(context, Buffer.from(sourceWithNull, "utf8"))

  await assert.rejects(() => readOsuSkinIniFile(filePath), /null character.*skin\.ini/i)
})

test("decodes a UTF-16LE osu skin.ini with a byte order mark", async (context) => {
  const filePath = await createSkinIni(
    context,
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, "utf16le")]),
  )

  assert.equal(await readOsuSkinIniFile(filePath), source)
})

test("decodes a UTF-16BE osu skin.ini with a byte order mark", async (context) => {
  const utf16BigEndian = Buffer.from(source, "utf16le").swap16()
  const filePath = await createSkinIni(
    context,
    Buffer.concat([Buffer.from([0xfe, 0xff]), utf16BigEndian]),
  )

  assert.equal(await readOsuSkinIniFile(filePath), source)
})

test("rejects an osu skin.ini with invalid UTF-8 bytes", async (context) => {
  const filePath = await createSkinIni(
    context,
    Buffer.concat([
      Buffer.from("[General]\nName: Caf", "utf8"),
      Buffer.from([0xe9]),
      Buffer.from("\n"),
    ]),
  )

  await assert.rejects(() => readOsuSkinIniFile(filePath), /UTF-8 or UTF-16.*skin\.ini/i)
})

test("rejects a UTF-16 osu skin.ini without a byte order mark", async (context) => {
  const filePath = await createSkinIni(context, Buffer.from(source, "utf16le"))

  await assert.rejects(() => readOsuSkinIniFile(filePath), /byte order mark.*skin\.ini/i)
})

test("rejects a UTF-16 osu skin.ini without a byte order mark after a Unicode prefix", async (context) => {
  const filePath = await createSkinIni(
    context,
    Buffer.from("䅁䉂\\n[General]\\nName: ASCII Fixture\\n", "utf16le"),
  )

  await assert.rejects(() => readOsuSkinIniFile(filePath), /byte order mark.*skin\.ini/i)
})

async function createSkinIni(context: test.TestContext, contents: Uint8Array): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "osu-skin-ini-encoding-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "skin.ini")
  await writeFile(filePath, contents)
  return filePath
}
