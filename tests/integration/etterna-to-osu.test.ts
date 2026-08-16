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
import { type JudgementGrade, judgementGrades } from "../../src/domain/judgement.ts"
import { TransactionalOutputPublisher } from "../../src/infrastructure/filesystem/transactional-output-publisher.ts"

test("converts an Etterna skin into a fully replaced osu workspace", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-conversion-"))
  const gameRoot = path.join(directory, "Etterna")
  const skinDirectory = path.join(gameRoot, "NoteSkins", "dance", "Fixture Skin")
  const profileRoot = path.join(gameRoot, "Save", "LocalProfiles", "00000000")
  const profileDirectory = path.join(profileRoot, "Rebirth_settings")
  const assetsSettingsDirectory = path.join(gameRoot, "Save", "Rebirth_settings")
  const judgementDirectory = path.join(gameRoot, "Assets", "Judgments")
  const judgementPath = path.join(judgementDirectory, "Fixture Judgment 2x6 (Doubleres).png")
  const defaultJudgementPath = path.join(judgementDirectory, "default 1x6 (Doubleres).png")
  const templatesDirectory = path.join(directory, "templates")
  const outputDirectory = path.join(directory, "output")
  const longNoteBody = Buffer.from([10, 20, 30, 40])
  const longNoteTail = Buffer.from([50, 60, 70])
  try {
    await mkdir(path.join(skinDirectory, "Receptors"), {
      recursive: true,
    })
    await mkdir(path.join(skinDirectory, "Notes"), { recursive: true })
    await mkdir(profileDirectory, { recursive: true })
    await mkdir(assetsSettingsDirectory, { recursive: true })
    await mkdir(judgementDirectory, { recursive: true })
    await mkdir(templatesDirectory, { recursive: true })
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(path.join(outputDirectory, "stale.txt"), "stale")
    await writeFile(
      path.join(profileRoot, "Etterna.xml"),
      `<Stats>
        <Guid>fixtureguid</Guid>
        <DefaultModifiers><dance>C888, Reverse</dance></DefaultModifiers>
      </Stats>`,
    )
    await writeFile(
      path.join(assetsSettingsDirectory, "assetsConfig.lua"),
      `
        return {
          judgment = {
            fixtureguid = "Assets/Judgments/Fixture Judgment 2x6 (Doubleres).png",
            default = "Assets/Judgments/default 1x6 (Doubleres).png",
          },
        }
      `,
    )
    await writeTwoBySixJudgementSheet(judgementPath)
    await sharp({
      create: {
        width: 8,
        height: 36,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toFile(defaultJudgementPath)
    await writeFile(
      path.join(profileDirectory, "playerConfig.lua"),
      `
        return {
          GameplayXYCoordinates = {
            ["4k"] = {
              NoteFieldY = -6,
              JudgmentY = 4,
              ComboY = -20,
            },
          },
          GameplaySizes = {
            ["4K"] = {
              JudgmentZoom = 0.35,
              ComboZoom = 0.6,
            },
          },
          ReceptorSize = 100,
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
      `Name: \${skin_name}\nHitPosition: \${hit_position}\nComboPosition: \${combo_position}\nScorePosition: \${score_position}\nColumnWidth: \${column_width},\${column_width},\${column_width},\${column_width}\nHit0: mania\\judgements\\miss\nHit50: mania\\judgements\\bad\nHit100: mania\\judgements\\good\nHit200: mania\\judgements\\great\nHit300: mania\\judgements\\perfect\nHit300g: mania\\judgements\\marvelous\n`,
    )
    await writeFile(path.join(templatesDirectory, "LNB.png"), longNoteBody)
    await writeFile(path.join(templatesDirectory, "LNT.png"), longNoteTail)
    for (const character of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "comma", "dot"]) {
      for (const [suffix, dimensions] of [
        [".png", { width: 10, height: 6 }],
        ["@2x.png", { width: 20, height: 12 }],
      ] as const) {
        await sharp({
          create: {
            ...dimensions,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        })
          .png()
          .toFile(path.join(templatesDirectory, `combo-${character}${suffix}`))
      }
    }
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
        readers: new Map([
          ["etterna", new EtternaSkinReader({ profileId: "00000000", theme: "Rebirth" })],
        ]),
        writers: new Map([["osu", new OsuSkinWriter(templatesDirectory)]]),
        conversions: new ConversionRegistry([new EtternaToOsuConversion()]),
        publisher: new TransactionalOutputPublisher(),
      },
    )

    assert.equal(
      await readFile(path.join(outputDirectory, "skin.ini"), "utf8"),
      "Name: Fixture Skin\nHitPosition: 433\nComboPosition: 209\nScorePosition: 244\nColumnWidth: 62,62,62,62\nHit0: mania\\judgements\\miss\nHit50: mania\\judgements\\bad\nHit100: mania\\judgements\\good\nHit200: mania\\judgements\\great\nHit300: mania\\judgements\\perfect\nHit300g: mania\\judgements\\marvelous\n",
    )
    assert.equal((await readdir(outputDirectory)).includes("stale.txt"), false)
    const receptorPath = path.join(outputDirectory, "mania", "receptors", "left@2x.png")
    const receptor = await sharp(receptorPath).raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(
      { width: receptor.info.width, height: receptor.info.height },
      { width: 150, height: 366 },
    )
    assert.deepEqual(alphaBounds(receptor.data, receptor.info.width, receptor.info.height), {
      left: 0,
      top: 96,
      right: 149,
      bottom: 196,
    })
    await assert.rejects(
      () => readFile(path.join(outputDirectory, "mania", "receptors", "left.png")),
      { code: "ENOENT" },
    )
    const note = await sharp(path.join(outputDirectory, "mania", "notes", "left.png")).metadata()
    assert.deepEqual({ width: note.width, height: note.height }, { width: 32, height: 24 })
    assert.deepEqual(
      await readFile(path.join(outputDirectory, "mania", "lns", "body.png")),
      longNoteBody,
    )
    assert.deepEqual(
      await readFile(path.join(outputDirectory, "mania", "lns", "tail.png")),
      longNoteTail,
    )
    for (const filename of ["receptor-base.png", "LNB.png", "LNT.png"]) {
      await assert.rejects(() => readFile(path.join(outputDirectory, filename)), {
        code: "ENOENT",
      })
    }
    const judgementOutputDirectory = path.join(outputDirectory, "mania", "judgements")
    assert.deepEqual((await readdir(judgementOutputDirectory)).sort(), [
      "bad.png",
      "bad@2x.png",
      "good.png",
      "good@2x.png",
      "great.png",
      "great@2x.png",
      "marvelous.png",
      "marvelous@2x.png",
      "miss.png",
      "miss@2x.png",
      "perfect.png",
      "perfect@2x.png",
    ])
    const expectedLeftColors = Object.fromEntries(
      judgementGrades.map((grade, index) => [grade, leftColors[index]]),
    ) as Record<JudgementGrade, (typeof leftColors)[number]>

    for (const [grade, color] of Object.entries(expectedLeftColors)) {
      for (const [suffix, expectedDimensions] of [
        [".png", { width: 3, height: 2 }],
        ["@2x.png", { width: 5, height: 4 }],
      ] as const) {
        const { data, info } = await sharp(path.join(judgementOutputDirectory, `${grade}${suffix}`))
          .raw()
          .toBuffer({ resolveWithObject: true })
        assert.deepEqual({ width: info.width, height: info.height }, expectedDimensions)
        const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4
        assert.deepEqual([...data.subarray(offset, offset + 3)], [color.r, color.g, color.b])
      }
    }
    for (const character of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "comma", "dot"]) {
      for (const [suffix, expectedDimensions] of [
        [".png", { width: 6, height: 4 }],
        ["@2x.png", { width: 12, height: 7 }],
      ] as const) {
        const image = await sharp(
          path.join(outputDirectory, `combo-${character}${suffix}`),
        ).metadata()
        assert.deepEqual({ width: image.width, height: image.height }, expectedDimensions)
      }
    }
    assert.deepEqual(result.diagnostics, [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

const leftColors = [
  { r: 255, g: 0, b: 0 },
  { r: 255, g: 128, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 128, b: 255 },
  { r: 255, g: 0, b: 255 },
] as const

async function writeTwoBySixJudgementSheet(filePath: string): Promise<void> {
  const frameWidth = 8
  const frameHeight = 6
  const width = frameWidth * 2
  const height = frameHeight * 6
  const data = Buffer.alloc(width * height * 4)

  for (let row = 0; row < 6; row += 1) {
    const leftColor = leftColors[row]
    if (!leftColor) {
      throw new Error(`Missing judgement fixture color for row ${row}`)
    }
    for (let column = 0; column < 2; column += 1) {
      const color = column === 0 ? leftColor : { r: 16, g: row * 20, b: 16 }
      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          const sourceX = column * frameWidth + x
          const sourceY = row * frameHeight + y
          const offset = (sourceY * width + sourceX) * 4
          data[offset] = color.r
          data[offset + 1] = color.g
          data[offset + 2] = color.b
          data[offset + 3] = 255
        }
      }
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(filePath)
}

function alphaBounds(data: Buffer, width: number, height: number) {
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  }

  return { left, top, right, bottom }
}
