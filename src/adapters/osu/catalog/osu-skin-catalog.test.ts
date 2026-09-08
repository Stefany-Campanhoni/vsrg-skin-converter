import { expect, onTestFinished, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { concatBytes, utf16LittleEndianBytes } from "../../../../tests/support/bytes.ts"
import { expectRejectionSatisfies } from "../../../../tests/support/expectations.ts"
import { OsuSkinCatalog } from "./osu-skin-catalog.ts"

test("lists immediate osu skins by their General names", async () => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "osu-skin-catalog-"))
  onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
  const skinsRoot = path.join(osuRoot, "Skins")
  await writeSkin(skinsRoot, "Folder Name", "Skin.InI", "Fixture Name")
  await writeSkin(skinsRoot, "Another Folder", "skin.ini", "Another Name")
  await writeFile(path.join(skinsRoot, "unrelated.txt"), "ignored")
  await mkdir(path.join(skinsRoot, "Folder Name", "Nested Skin"))

  expect(await new OsuSkinCatalog().listSkins(osuRoot)).toStrictEqual([
    {
      game: "osu",
      name: "Another Name",
      sourcePath: path.join(osuRoot, "Skins", "Another Folder"),
      gameRoot: osuRoot,
    },
    {
      game: "osu",
      name: "Fixture Name",
      sourcePath: path.join(osuRoot, "Skins", "Folder Name"),
      gameRoot: osuRoot,
    },
  ])
})

test("ignores skin directories without a skin.ini", async () => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "invalid-osu-skin-catalog-"))
  onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
  const skinsRoot = path.join(osuRoot, "Skins")
  await mkdir(path.join(skinsRoot, "Missing Ini"), { recursive: true })
  await writeSkin(skinsRoot, "Valid Skin", "skin.ini", "Valid Skin")

  expect(await new OsuSkinCatalog().listSkins(osuRoot)).toStrictEqual([
    {
      game: "osu",
      name: "Valid Skin",
      sourcePath: path.join(skinsRoot, "Valid Skin"),
      gameRoot: osuRoot,
    },
  ])
})

test("uses the skin folder name when the General Name property is missing", async () => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "fallback-osu-skin-catalog-"))
  onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
  const skinDirectory = path.join(osuRoot, "Skins", "Folder Fallback")
  await mkdir(skinDirectory, { recursive: true })
  await writeFile(path.join(skinDirectory, "skin.ini"), "[General]\nName-General: Wrong Property")

  expect(await new OsuSkinCatalog().listSkins(osuRoot)).toStrictEqual([
    {
      game: "osu",
      name: "Folder Fallback",
      sourcePath: skinDirectory,
      gameRoot: osuRoot,
    },
  ])
})

test("lists a skin whose UTF-16LE skin.ini has a byte order mark", async () => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "utf16-osu-skin-catalog-"))
  onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
  const skinDirectory = path.join(osuRoot, "Skins", "UTF-16 Skin")
  await mkdir(skinDirectory, { recursive: true })
  await writeFile(
    path.join(skinDirectory, "skin.ini"),
    concatBytes([
      new Uint8Array([0xff, 0xfe]),
      utf16LittleEndianBytes("[General]\nName: UTF-16 Fixture"),
    ]),
  )

  expect(await new OsuSkinCatalog().listSkins(osuRoot)).toStrictEqual([
    {
      game: "osu",
      name: "UTF-16 Fixture",
      sourcePath: skinDirectory,
      gameRoot: osuRoot,
    },
  ])
})

test.skipIf(process.platform === "win32")(
  "rejects duplicate case-insensitive skin.ini files",
  async () => {
    const osuRoot = await mkdtemp(path.join(os.tmpdir(), "duplicate-osu-skin-catalog-"))
    onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
    const skinDirectory = path.join(osuRoot, "Skins", "Duplicate Ini")
    await mkdir(skinDirectory, { recursive: true })
    await writeFile(path.join(skinDirectory, "skin.ini"), "[General]\nName: First")
    await writeFile(path.join(skinDirectory, "SKIN.INI"), "[General]\nName: Second")
    await expectRejectionSatisfies(
      (() => new OsuSkinCatalog().listSkins(osuRoot))(),
      (error) =>
        error instanceof Error &&
        error.cause instanceof Error &&
        /exactly one skin\.ini/i.test(error.cause.message),
    )
  },
)

test("does not treat a directory named skin.ini as the required regular file", async () => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "directory-osu-skin-catalog-"))
  onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
  const skinDirectory = path.join(osuRoot, "Skins", "Directory Ini")
  await mkdir(path.join(skinDirectory, "skin.ini"), { recursive: true })

  await expectRejectionSatisfies(
    (() => new OsuSkinCatalog().listSkins(osuRoot))(),
    (error) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      /exactly one skin\.ini/i.test(error.cause.message),
  )
})

test.skipIf(process.platform === "win32")(
  "rejects a skin.ini file alongside a case-variant skin.ini directory",
  async () => {
    const osuRoot = await mkdtemp(path.join(os.tmpdir(), "mixed-osu-skin-catalog-"))
    onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
    const skinDirectory = path.join(osuRoot, "Skins", "Mixed Ini")
    await mkdir(skinDirectory, { recursive: true })
    await writeFile(path.join(skinDirectory, "skin.ini"), "[General]\nName: Valid")
    await mkdir(path.join(skinDirectory, "SKIN.INI"))

    await expect((() => new OsuSkinCatalog().listSkins(osuRoot))()).rejects.toThrow(/Mixed Ini/)
  },
)

test("lists a skin with duplicate General sections by its last Name", async () => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "duplicate-general-osu-catalog-"))
  onTestFinished(() => rm(osuRoot, { recursive: true, force: true }))
  const skinDirectory = path.join(osuRoot, "Skins", "Duplicate General")
  await mkdir(skinDirectory, { recursive: true })
  await writeFile(
    path.join(skinDirectory, "skin.ini"),
    "[General]\nName: First Name\n[gEnErAl]\nName: Second Name",
  )

  expect(await new OsuSkinCatalog().listSkins(osuRoot)).toStrictEqual([
    {
      game: "osu",
      name: "Second Name",
      sourcePath: skinDirectory,
      gameRoot: osuRoot,
    },
  ])
})

async function writeSkin(
  skinsRoot: string,
  directoryName: string,
  iniName: string,
  skinName: string,
): Promise<void> {
  const directory = path.join(skinsRoot, directoryName)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, iniName), `[General]\nName: ${skinName}`)
}
