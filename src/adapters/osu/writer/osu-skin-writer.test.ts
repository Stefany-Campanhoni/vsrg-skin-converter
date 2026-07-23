import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import type { ImageAsset, ReceptorSet, TapNoteSet } from "../../../domain/image.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { OsuSkinWriter } from "./osu-skin-writer.ts"

test("writes a complete osu skin workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-writer-"))
  const templates = path.join(root, "templates")
  const workspace = path.join(root, "workspace")
  const source = path.join(root, "source.png")
  try {
    await mkdir(templates, { recursive: true })
    await writeFile(
      path.join(templates, "skin.ini"),
      `Name: \${skin_name}\nHitPosition: \${hit_position}\n`,
    )
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
    const skin: SkinModel = {
      game: "osu",
      metadata: { name: "Fixture" },
      playfield: {
        hitPosition: 432,
        judgementPosition: 0,
        comboPosition: 0,
      },
      assets: { receptors, tapNotes },
      diagnostics: [],
    }

    await new OsuSkinWriter(templates).writeSkin(skin, workspace)

    assert.equal(
      await readFile(path.join(workspace, "skin.ini"), "utf8"),
      "Name: Fixture\nHitPosition: 432\n",
    )
    await assert.doesNotReject(() =>
      readFile(path.join(workspace, "mania", "receptors", "left@2x.png")),
    )
    const note = await sharp(path.join(workspace, "mania", "notes", "left.png")).metadata()
    assert.deepEqual({ width: note.width, height: note.height }, { width: 24, height: 16 })
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
