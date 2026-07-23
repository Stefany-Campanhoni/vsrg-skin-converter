import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import { EtternaSkinReader } from "../../src/adapters/etterna/reader/etterna-skin-reader.ts"
import { OsuSkinWriter } from "../../src/adapters/osu/writer/osu-skin-writer.ts"
import { ConversionRegistry } from "../../src/application/conversion/conversion-registry.ts"
import { convertSkin } from "../../src/application/conversion/convert-skin.ts"
import { EtternaToOsuConversion } from "../../src/conversions/etterna-to-osu/etterna-to-osu-conversion.ts"
import { TransactionalOutputPublisher } from "../../src/infrastructure/filesystem/transactional-output-publisher.ts"

test("converts an Etterna skin into a fully replaced osu workspace", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-conversion-"))
  const gameRoot = path.join(directory, "Etterna")
  const skinDirectory = path.join(gameRoot, "NoteSkins", "dance", "Fixture Skin")
  const profileDirectory = path.join(
    gameRoot,
    "Save",
    "LocalProfiles",
    "00000000",
    "Rebirth_settings",
  )
  const templatesDirectory = path.join(directory, "templates")
  const outputDirectory = path.join(directory, "output")
  try {
    await mkdir(path.join(skinDirectory, "Receptors"), {
      recursive: true,
    })
    await mkdir(path.join(skinDirectory, "Notes"), { recursive: true })
    await mkdir(profileDirectory, { recursive: true })
    await mkdir(templatesDirectory, { recursive: true })
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(path.join(outputDirectory, "stale.txt"), "stale")
    await writeFile(
      path.join(profileDirectory, "profile.lua"),
      `
        return {
          GameplayXYCoordinates = {
            ["4k"] = {
              NoteFieldY = -6,
              JudgmentY = 0,
              ComboY = 0,
            },
          },
        }
      `,
    )
    await writeFile(
      path.join(skinDirectory, "NoteSkin.lua"),
      `
        local function createReceptor(direction)
          return Def.ActorFrame {
            Def.Sprite {
              Texture=NOTESKIN:GetPath("Receptors/_" .. direction, "Go Receptor"),
            },
            Def.Sprite {
              Texture=NOTESKIN:GetPath("Receptors/_" .. direction, "Press Receptor"),
            },
          }
        end
        local function createNote(direction)
          return Def.Sprite {
            Texture=NOTESKIN:GetPath("Notes/_" .. direction, "Tap Note"),
          }
        end
        return {}
      `,
    )
    for (const direction of ["Left", "Down", "Up", "Right"]) {
      for (const state of ["Go", "Press"]) {
        await sharp({
          create: {
            width: 20,
            height: 10,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        })
          .png()
          .toFile(path.join(skinDirectory, "Receptors", `_${direction} ${state} Receptor.png`))
      }
      await sharp({
        create: {
          width: 32,
          height: 24,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toFile(path.join(skinDirectory, "Notes", `_${direction} Tap Note.png`))
    }
    await writeFile(
      path.join(templatesDirectory, "skin.ini"),
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
      .toFile(path.join(templatesDirectory, "receptor-base.png"))

    const result = await convertSkin(
      {
        reference: {
          game: "etterna",
          name: "Fixture Skin",
          sourcePath: skinDirectory,
          gameRoot,
        },
        targetGame: "osu",
        outputDirectory,
      },
      {
        readers: new Map([["etterna", new EtternaSkinReader()]]),
        writers: new Map([["osu", new OsuSkinWriter(templatesDirectory)]]),
        conversions: new ConversionRegistry([new EtternaToOsuConversion()]),
        publisher: new TransactionalOutputPublisher(),
      },
    )

    assert.equal(
      await readFile(path.join(outputDirectory, "skin.ini"), "utf8"),
      "Name: Fixture Skin\nHitPosition: 432\n",
    )
    assert.equal((await readdir(outputDirectory)).includes("stale.txt"), false)
    const receptor = await sharp(
      path.join(outputDirectory, "mania", "receptors", "left.png"),
    ).metadata()
    assert.deepEqual(
      { width: receptor.width, height: receptor.height },
      { width: 150, height: 374 },
    )
    const note = await sharp(path.join(outputDirectory, "mania", "notes", "left.png")).metadata()
    assert.deepEqual({ width: note.width, height: note.height }, { width: 32, height: 24 })
    assert.deepEqual(result.diagnostics, [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
