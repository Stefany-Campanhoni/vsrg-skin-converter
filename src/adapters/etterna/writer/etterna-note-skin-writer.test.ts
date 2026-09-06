import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { expectResolves, expectTruthy } from "../../../../tests/support/expectations.ts"
import type { ImageAsset, ReceptorSet, TapNoteSet } from "../../../domain/image.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { EtternaNoteSkinWriter } from "./etterna-note-skin-writer.ts"

test("copies the complete static NoteSkin template and adds width-scaled receptors and notes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-writer-"))
  const templates = path.join(root, "templates")
  const workspace = path.join(root, "workspace")
  const source = path.join(root, "source.png")
  try {
    await mkdir(path.join(templates, "Holds"), { recursive: true })
    await writeFile(path.join(templates, "NoteSkin.lua"), "return {}")
    await writeFile(path.join(templates, "metrics.ini"), "[Global]\n")
    await writeFile(path.join(templates, "Holds", "static-ln.png"), new Uint8Array([7, 8, 9]))
    await writeFile(
      source,
      await sharp({
        create: {
          width: 6,
          height: 10,
          channels: 4,
          background: { r: 120, g: 40, b: 200, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    )

    await new EtternaNoteSkinWriter(templates).writeSkin(etternaSkin(source), workspace)

    expect(await readFile(path.join(workspace, "NoteSkin.lua"), "utf8")).toBe("return {}")
    expect(await readFile(path.join(workspace, "metrics.ini"), "utf8")).toBe("[Global]\n")
    expect([...(await readFile(path.join(workspace, "Holds", "static-ln.png")))]).toStrictEqual([
      7, 8, 9,
    ])
    const receptorFilenames = await readdir(path.join(workspace, "Receptors"))
    expect(receptorFilenames.length).toBe(8)
    for (const filename of receptorFilenames) {
      const metadata = await sharp(path.join(workspace, "Receptors", filename)).metadata()
      expect({ width: metadata.width, height: metadata.height }).toStrictEqual({
        width: 146,
        height: 243,
      })
    }
    const noteFilenames = await readdir(path.join(workspace, "Notes"))
    expect(noteFilenames.length).toBe(4)
    for (const filename of noteFilenames) {
      const metadata = await sharp(path.join(workspace, "Notes", filename)).metadata()
      expect({ width: metadata.width, height: metadata.height }).toStrictEqual({
        width: 150,
        height: 250,
      })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("does not require judgements in an osu-derived Etterna model", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-writer-"))
  const templates = path.join(root, "templates")
  const source = path.join(root, "source.png")
  try {
    await mkdir(templates)
    await writeFile(path.join(templates, "NoteSkin.lua"), "return {}")
    await writeFile(path.join(templates, "metrics.ini"), "[Global]\n")
    await writeFile(
      source,
      await sharp({
        create: {
          width: 4,
          height: 8,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    )

    await expectResolves(
      (() =>
        new EtternaNoteSkinWriter(templates).writeSkin(
          etternaSkin(source),
          path.join(root, "workspace"),
        ))(),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects non-Etterna and incomplete models before copying the template", async () => {
  const writer = new EtternaNoteSkinWriter("templates")
  const complete = etternaSkin("source.png")

  await expect(
    (() => writer.writeSkin({ ...complete, game: "osu" }, "workspace"))(),
  ).rejects.toThrow(/Etterna writer.*osu/i)
  await expect(
    (() => writer.writeSkin({ ...complete, assets: {} }, "workspace"))(),
  ).rejects.toThrow(/does not contain receptors/i)
  await expect(
    (() =>
      writer.writeSkin(
        { ...complete, assets: { receptors: complete.assets.receptors } },
        "workspace",
      ))(),
  ).rejects.toThrow(/does not contain tap notes/i)
})

test("writes neither asset group when receptor preparation fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-writer-"))
  const templates = path.join(root, "templates")
  const workspace = path.join(root, "workspace")
  const source = path.join(root, "source.png")
  const invalidReceptor = path.join(root, "invalid-receptor.png")
  try {
    await writeMinimalTemplate(templates)
    await writeVisiblePng(source)
    await writeFile(invalidReceptor, "not a PNG")
    const skin = etternaSkin(source)
    const receptors = skin.assets.receptors
    expectTruthy(receptors)
    receptors.left.normal = {
      filePath: invalidReceptor,
      rotation: 0,
      pixelDensity: "standard",
    }

    await expect(
      (() => new EtternaNoteSkinWriter(templates).writeSkin(skin, workspace))(),
    ).rejects.toThrow()

    await assertGeneratedDirectoriesAbsent(workspace)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("writes neither asset group when tap-note preparation fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-etterna-writer-"))
  const templates = path.join(root, "templates")
  const workspace = path.join(root, "workspace")
  const source = path.join(root, "source.png")
  try {
    await writeMinimalTemplate(templates)
    await writeVisiblePng(source)
    const skin = etternaSkin(source)
    const tapNotes = skin.assets.tapNotes
    expectTruthy(tapNotes)
    tapNotes.right = {
      filePath: path.join(root, "missing-note.png"),
      rotation: 0,
      pixelDensity: "standard",
    }

    await expect(
      (() => new EtternaNoteSkinWriter(templates).writeSkin(skin, workspace))(),
    ).rejects.toThrow()

    await assertGeneratedDirectoriesAbsent(workspace)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function etternaSkin(source: string): SkinModel {
  const image: ImageAsset = { filePath: source, rotation: 0, pixelDensity: "standard" }
  const receptors: ReceptorSet = {
    left: { normal: image, pressed: image },
    down: { normal: image, pressed: image },
    up: { normal: image, pressed: image },
    right: { normal: image, pressed: image },
  }
  const tapNotes: TapNoteSet = {
    left: image,
    down: image,
    up: image,
    right: image,
  }
  return {
    game: "etterna",
    metadata: { name: "Fixture" },
    playfield: {
      hitPosition: -7,
      judgementPosition: 4,
      comboPosition: -20,
      columnWidth: 100,
      comboScale: 1,
      judgementScale: 1,
      scrollSpeed: 1,
    },
    assets: { receptors, tapNotes },
    diagnostics: [],
  }
}

async function writeMinimalTemplate(templates: string): Promise<void> {
  await mkdir(templates)
  await writeFile(path.join(templates, "NoteSkin.lua"), "return {}")
  await writeFile(path.join(templates, "metrics.ini"), "[Global]\n")
}

async function writeVisiblePng(filePath: string): Promise<void> {
  await writeFile(
    filePath,
    await sharp({
      create: {
        width: 4,
        height: 8,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer(),
  )
}

async function assertGeneratedDirectoriesAbsent(workspace: string): Promise<void> {
  for (const directory of ["Notes", "Receptors"]) {
    await expect((() => readdir(path.join(workspace, directory)))()).rejects.toMatchObject({
      code: "ENOENT",
    })
  }
}
