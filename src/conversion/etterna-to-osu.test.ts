import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import { convertEtternaToOsu } from "./etterna-to-osu.ts"

test("converts Etterna hit position, receptors, and notes into the copied osu template", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-conversion-"))
  const skinDirectory = path.join(directory, "source")
  const templatesDirectory = path.join(directory, "templates")
  const outputDirectory = path.join(directory, "output")
  try {
    await mkdir(path.join(skinDirectory, "Receptors"), { recursive: true })
    await mkdir(templatesDirectory, { recursive: true })
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
    await mkdir(path.join(skinDirectory, "Notes"), { recursive: true })
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

    const result = await convertEtternaToOsu({
      skin: { name: "Fixture Skin", fullPath: skinDirectory },
      skinPositions: {
        hitPosition: -6,
        judgementPosition: 0,
        comboPosition: 0,
      },
      templatesDirectory,
      outputDirectory,
    })

    assert.equal(
      await readFile(path.join(outputDirectory, "skin.ini"), "utf8"),
      "Name: Fixture Skin\nHitPosition: 432\n",
    )
    const receptor = await sharp(
      path.join(outputDirectory, "mania", "receptors", "left.png"),
    ).metadata()
    assert.equal(receptor.width, 150)
    assert.equal(receptor.height, 374)
    const note = await sharp(path.join(outputDirectory, "mania", "notes", "left.png")).metadata()
    assert.equal(note.width, 32)
    assert.equal(note.height, 24)
    assert.deepEqual(result.warnings, [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
