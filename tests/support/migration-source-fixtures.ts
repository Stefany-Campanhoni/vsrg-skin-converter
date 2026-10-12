import sharp from "sharp"
import type { SkinModel } from "../../src/domain/skin.ts"

export function createReferenceOsuModel(): SkinModel {
  return {
    game: "osu",
    metadata: { name: "Reference" },
    assets: {},
    diagnostics: [],
    playfield: {
      hitPosition: 432,
      judgementPosition: 244,
      comboPosition: 209,
      columnWidth: 68,
      comboScale: 1,
      judgementScale: 1,
      scrollSpeed: 29,
    },
  }
}

const encoder = new TextEncoder()
export async function createOsuSourceFixture(): Promise<ReadonlyMap<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const lines = [
    "[General]",
    "Name: Reference",
    "[Mania]",
    "Keys: 4",
    "HitPosition: 432",
    "ScorePosition: 244",
    "ComboPosition: 209",
    "ColumnWidth: 68,68,68,68",
    "UpsideDown: 1",
  ]
  for (const [index, direction] of ["left", "down", "up", "right"].entries()) {
    for (const [key, prefix] of [
      ["KeyImage", "normal"],
      ["KeyImage", "pressed"],
      ["NoteImage", "note"],
    ] as const) {
      const suffix = prefix === "pressed" ? "D" : ""
      lines.push(`${key}${index}${suffix}: ${prefix}-${direction}`)
      files.set(
        `${prefix}-${direction}.png`,
        await solidImage(
          20 + index * 2,
          prefix === "note" ? 15 + index * 2 : 10,
          index * 40,
          prefix === "pressed" ? 210 : 90,
        ),
      )
    }
  }
  files.set("skin.ini", encoder.encode(lines.join("\n")))
  return files
}

export async function createEtternaSourceFixture(): Promise<ReadonlyMap<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const root = "NoteSkins/dance/Reference/"
  files.set(
    `${root}NoteSkin.lua`,
    encoder.encode(`
local function createReceptor(direction)
  return Def.ActorFrame {
    Def.Sprite { Texture=NOTESKIN:GetPath("Receptors/_" .. direction, "Go Receptor") },
    Def.Sprite { Texture=NOTESKIN:GetPath("Receptors/_" .. direction, "Press Receptor") },
  }
end
local function createNote(direction)
  return Def.Sprite { Texture=NOTESKIN:GetPath("Notes/_" .. direction, "Tap Note") }
end
return {}
`),
  )
  for (const [index, direction] of ["Left", "Down", "Up", "Right"].entries()) {
    for (const state of ["Go", "Press"])
      files.set(
        `${root}Receptors/_${direction} ${state} Receptor.png`,
        await solidImage(20, 10, index * 40, state === "Press" ? 210 : 90),
      )
    files.set(`${root}Notes/_${direction} Tap Note.png`, await solidImage(32, 24, index * 40, 90))
  }
  files.set("Save/Preferences.ini", encoder.encode("[Options]\nTheme=Rebirth\n"))
  files.set(
    "Save/LocalProfiles/00000000/Etterna.xml",
    encoder.encode(
      "<Stats><Guid>fixtureguid</Guid><DefaultModifiers><dance>C888, Reverse</dance></DefaultModifiers></Stats>",
    ),
  )
  files.set(
    "Save/LocalProfiles/00000000/Rebirth_settings/playerConfig.lua",
    encoder.encode(
      `return { GameplayXYCoordinates = { ["4k"] = { NoteFieldY = -6, JudgmentY = 4, ComboY = -20 } }, GameplaySizes = { ["4K"] = { JudgmentZoom = 0.35, ComboZoom = 0.6 } }, ReceptorSize = 108 }`,
    ),
  )
  files.set(
    "Save/Rebirth_settings/assetsConfig.lua",
    encoder.encode('return { judgment = { default = "Assets/Judgments/default 1x6.png" } }'),
  )
  files.set("Assets/Judgments/default 1x6.png", await solidImage(8, 36, 240, 240))
  return files
}

function solidImage(width: number, height: number, r: number, g: number): Promise<Uint8Array> {
  return sharp({ create: { width, height, channels: 4, background: { r, g, b: 200, alpha: 1 } } })
    .png()
    .toBuffer()
}
