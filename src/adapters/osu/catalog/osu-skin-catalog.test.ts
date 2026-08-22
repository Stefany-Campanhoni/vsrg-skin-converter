import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { OsuSkinCatalog } from "./osu-skin-catalog.ts"

test("lists immediate osu skins by their General names", async (context) => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "osu-skin-catalog-"))
  context.after(() => rm(osuRoot, { recursive: true, force: true }))
  const skinsRoot = path.join(osuRoot, "Skins")
  await writeSkin(skinsRoot, "Folder Name", "Skin.InI", "Fixture Name")
  await writeSkin(skinsRoot, "Another Folder", "skin.ini", "Another Name")
  await writeFile(path.join(skinsRoot, "unrelated.txt"), "ignored")
  await mkdir(path.join(skinsRoot, "Folder Name", "Nested Skin"))

  assert.deepEqual(await new OsuSkinCatalog().listSkins(osuRoot), [
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

test("rejects skin directories without one usable skin.ini", async (context) => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "invalid-osu-skin-catalog-"))
  context.after(() => rm(osuRoot, { recursive: true, force: true }))
  const skinsRoot = path.join(osuRoot, "Skins")
  await mkdir(path.join(skinsRoot, "Missing Ini"), { recursive: true })

  await assert.rejects(() => new OsuSkinCatalog().listSkins(osuRoot), /Missing Ini/)
})

test("uses the skin folder name when the General Name property is missing", async (context) => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "fallback-osu-skin-catalog-"))
  context.after(() => rm(osuRoot, { recursive: true, force: true }))
  const skinDirectory = path.join(osuRoot, "Skins", "Folder Fallback")
  await mkdir(skinDirectory, { recursive: true })
  await writeFile(path.join(skinDirectory, "skin.ini"), "[General]\nName-General: Wrong Property")

  assert.deepEqual(await new OsuSkinCatalog().listSkins(osuRoot), [
    {
      game: "osu",
      name: "Folder Fallback",
      sourcePath: skinDirectory,
      gameRoot: osuRoot,
    },
  ])
})

test("rejects duplicate case-insensitive skin.ini files", async (context) => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "duplicate-osu-skin-catalog-"))
  context.after(() => rm(osuRoot, { recursive: true, force: true }))
  const skinDirectory = path.join(osuRoot, "Skins", "Duplicate Ini")
  await mkdir(skinDirectory, { recursive: true })
  await writeFile(path.join(skinDirectory, "skin.ini"), "[General]\nName: First")
  await writeFile(path.join(skinDirectory, "SKIN.INI"), "[General]\nName: Second")
  if ((await readdir(skinDirectory)).length < 2) {
    context.skip("The current filesystem treats case-only filenames as identical")
    return
  }

  await assert.rejects(
    () => new OsuSkinCatalog().listSkins(osuRoot),
    (error) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      /exactly one skin\.ini/i.test(error.cause.message),
  )
})

test("does not treat a directory named skin.ini as the required regular file", async (context) => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "directory-osu-skin-catalog-"))
  context.after(() => rm(osuRoot, { recursive: true, force: true }))
  const skinDirectory = path.join(osuRoot, "Skins", "Directory Ini")
  await mkdir(path.join(skinDirectory, "skin.ini"), { recursive: true })

  await assert.rejects(
    () => new OsuSkinCatalog().listSkins(osuRoot),
    (error) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      /exactly one skin\.ini/i.test(error.cause.message),
  )
})

test("wraps a duplicate General section error with skin catalog context", async (context) => {
  const osuRoot = await mkdtemp(path.join(os.tmpdir(), "duplicate-general-osu-catalog-"))
  context.after(() => rm(osuRoot, { recursive: true, force: true }))
  const skinDirectory = path.join(osuRoot, "Skins", "Duplicate General")
  await mkdir(skinDirectory, { recursive: true })
  await writeFile(
    path.join(skinDirectory, "skin.ini"),
    "[General]\nName: First Name\n[gEnErAl]\nName: Second Name",
  )

  await assert.rejects(
    () => new OsuSkinCatalog().listSkins(osuRoot),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Could not read osu! skin Duplicate General/)
      assert.ok(error.cause instanceof Error)
      assert.match(error.cause.message, /at most one General section.*skin\.ini/i)
      return true
    },
  )
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
