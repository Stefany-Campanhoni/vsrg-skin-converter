import { expect, onTestFinished, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  concatBytes,
  utf8Bytes,
  utf16BigEndianBytes,
  utf16LittleEndianBytes,
} from "../../../../tests/support/bytes.ts"
import { readOsuSkinIniFile } from "./read-osu-skin-ini-file.ts"

const source = "[General]\nName: Café\n"

test("decodes a UTF-8 osu skin.ini with a byte order mark", async () => {
  const sourceBytes = new TextEncoder().encode(source)
  const contents = new Uint8Array(3 + sourceBytes.length)
  contents.set([0xef, 0xbb, 0xbf])
  contents.set(sourceBytes, 3)
  const filePath = await createSkinIni(contents)

  expect(await readOsuSkinIniFile(filePath)).toBe(source)
})

test("rejects null characters in a UTF-8 osu skin.ini", async () => {
  const sourceWithNull = "[General]\nName: Café\nUnused: \0"
  const filePath = await createSkinIni(utf8Bytes(sourceWithNull))

  await expect((() => readOsuSkinIniFile(filePath))()).rejects.toThrow(/null character.*skin\.ini/i)
})

test("decodes a UTF-16LE osu skin.ini with a byte order mark", async () => {
  const filePath = await createSkinIni(
    concatBytes([new Uint8Array([0xff, 0xfe]), utf16LittleEndianBytes(source)]),
  )

  expect(await readOsuSkinIniFile(filePath)).toBe(source)
})

test("decodes a UTF-16BE osu skin.ini with a byte order mark", async () => {
  const filePath = await createSkinIni(
    concatBytes([new Uint8Array([0xfe, 0xff]), utf16BigEndianBytes(source)]),
  )

  expect(await readOsuSkinIniFile(filePath)).toBe(source)
})

test("rejects an osu skin.ini with invalid UTF-8 bytes", async () => {
  const filePath = await createSkinIni(
    concatBytes([utf8Bytes("[General]\nName: Caf"), new Uint8Array([0xe9]), utf8Bytes("\n")]),
  )

  await expect((() => readOsuSkinIniFile(filePath))()).rejects.toThrow(
    /UTF-8 or UTF-16.*skin\.ini/i,
  )
})

test("rejects a UTF-16 osu skin.ini without a byte order mark", async () => {
  const filePath = await createSkinIni(utf16LittleEndianBytes(source))

  await expect((() => readOsuSkinIniFile(filePath))()).rejects.toThrow(
    /byte order mark.*skin\.ini/i,
  )
})

test("rejects a UTF-16 osu skin.ini without a byte order mark after a Unicode prefix", async () => {
  const filePath = await createSkinIni(
    utf16LittleEndianBytes("䅁䉂\\n[General]\\nName: ASCII Fixture\\n"),
  )

  await expect((() => readOsuSkinIniFile(filePath))()).rejects.toThrow(
    /byte order mark.*skin\.ini/i,
  )
})

async function createSkinIni(contents: Uint8Array): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "osu-skin-ini-encoding-"))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "skin.ini")
  await writeFile(filePath, contents)
  return filePath
}
