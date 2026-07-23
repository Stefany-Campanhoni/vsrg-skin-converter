import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import type { ImageAsset, ReceptorSet, TapNoteSet } from "../../../domain/image.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { TransactionalOutputPublisher } from "../../../infrastructure/filesystem/transactional-output-publisher.ts"
import { OsuSkinWriter } from "./osu-skin-writer.ts"

test("writes a complete osu skin workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-writer-"))
  const templates = path.join(root, "templates")
  const workspace = path.join(root, "workspace")
  const source = path.join(root, "source.png")
  const longNoteBody = Buffer.from([1, 2, 3])
  const longNoteTail = Buffer.from([4, 5])
  try {
    await mkdir(templates, { recursive: true })
    await writeFile(
      path.join(templates, "skin.ini"),
      `Name: \${skin_name}\nHitPosition: \${hit_position}\nColumnWidth: \${column_width},\${column_width},\${column_width},\${column_width}\n`,
    )
    await writeFile(path.join(templates, "LNB.png"), longNoteBody)
    await writeFile(path.join(templates, "LNT.png"), longNoteTail)
    await sharp({
      create: {
        width: 150,
        height: 356,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(path.join(templates, "receptor-base.png"))
    await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)

    const skin = completeOsuSkin(source)

    await new OsuSkinWriter(templates).writeSkin(skin, workspace)

    assert.equal(
      await readFile(path.join(workspace, "skin.ini"), "utf8"),
      "Name: Fixture\nHitPosition: 432\nColumnWidth: 62,62,62,62\n",
    )
    await assert.doesNotReject(() =>
      readFile(path.join(workspace, "mania", "receptors", "left@2x.png")),
    )
    const note = await sharp(path.join(workspace, "mania", "notes", "left.png")).metadata()
    assert.deepEqual({ width: note.width, height: note.height }, { width: 24, height: 16 })
    assert.deepEqual(await readFile(path.join(workspace, "mania", "lns", "body.png")), longNoteBody)
    assert.deepEqual(await readFile(path.join(workspace, "mania", "lns", "tail.png")), longNoteTail)
    for (const filename of ["receptor-base.png", "LNB.png", "LNT.png"]) {
      await assert.rejects(() => readFile(path.join(workspace, filename)), {
        code: "ENOENT",
      })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("preserves template artifacts when long-note publication fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-writer-failed-ln-"))
  const templates = path.join(root, "templates")
  const workspace = path.join(root, "workspace")
  const source = path.join(root, "source.png")
  try {
    await mkdir(templates, { recursive: true })
    await writeFile(
      path.join(templates, "skin.ini"),
      `Name: \${skin_name}\nHitPosition: \${hit_position}\nColumnWidth: \${column_width},\${column_width},\${column_width},\${column_width}\n`,
    )
    await writeFile(path.join(templates, "LNB.png"), Buffer.from([1, 2, 3]))
    await sharp({
      create: {
        width: 150,
        height: 356,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(path.join(templates, "receptor-base.png"))
    await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)

    const skin = completeOsuSkin(source)

    await assert.rejects(() => new OsuSkinWriter(templates).writeSkin(skin, workspace), {
      code: "ENOENT",
    })
    await assert.doesNotReject(() => readFile(path.join(workspace, "receptor-base.png")))
    await assert.doesNotReject(() =>
      readFile(path.join(workspace, "mania", "receptors", "left@2x.png")),
    )
    await assert.doesNotReject(() => readFile(path.join(workspace, "mania", "notes", "left.png")))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("publisher preserves the previous target and removes staging after a writer failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-writer-publisher-failed-ln-"))
  const templates = path.join(root, "templates")
  const output = path.join(root, "output")
  const source = path.join(root, "source.png")
  try {
    await mkdir(templates, { recursive: true })
    await mkdir(output, { recursive: true })
    await writeFile(path.join(output, "current.txt"), "current")
    await writeFile(
      path.join(templates, "skin.ini"),
      `Name: \${skin_name}\nHitPosition: \${hit_position}\nColumnWidth: \${column_width},\${column_width},\${column_width},\${column_width}\n`,
    )
    await writeFile(path.join(templates, "LNB.png"), Buffer.from([1, 2, 3]))
    await sharp({
      create: {
        width: 150,
        height: 356,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(path.join(templates, "receptor-base.png"))
    await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(source)

    const writer = new OsuSkinWriter(templates)
    await assert.rejects(
      () =>
        new TransactionalOutputPublisher().publish(output, (workspace) =>
          writer.writeSkin(completeOsuSkin(source), workspace),
        ),
      { code: "ENOENT" },
    )

    assert.deepEqual(await readdir(output), ["current.txt"])
    assert.equal(await readFile(path.join(output, "current.txt"), "utf8"), "current")
    assert.deepEqual((await readdir(root)).sort(), ["output", "source.png", "templates"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects incomplete or non-osu models", async () => {
  const writer = new OsuSkinWriter("templates")
  const base: SkinModel = {
    game: "osu",
    metadata: { name: "Fixture" },
    playfield: {
      hitPosition: 438,
      judgementPosition: 0,
      comboPosition: 0,
      columnWidth: 62,
    },
    assets: {},
    diagnostics: [],
  }

  await assert.rejects(() => writer.writeSkin(base, "workspace"), /receptors/i)
  await assert.rejects(
    () => writer.writeSkin({ ...base, game: "etterna" }, "workspace"),
    /osu writer.*etterna/i,
  )
})

function completeOsuSkin(source: string): SkinModel {
  const image: ImageAsset = { filePath: source, rotation: 0 }
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
    game: "osu",
    metadata: { name: "Fixture" },
    playfield: {
      hitPosition: 432,
      judgementPosition: 0,
      comboPosition: 0,
      columnWidth: 62,
    },
    assets: { receptors, tapNotes },
    diagnostics: [],
  }
}
