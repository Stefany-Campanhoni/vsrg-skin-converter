import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expectTruthy } from "../../../../../tests/support/expectations.ts"
import { loadNoteSkinContext } from "../note-skin-context.ts"
import { analyzeEtternaNotes } from "./analyze-notes.ts"

async function withSkin(
  files: Record<string, string>,
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-notes-"))
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const filePath = path.join(directory, relativePath)
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, contents)
    }
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function analyzeSkin(directory: string) {
  return analyzeEtternaNotes(await loadNoteSkinContext(directory))
}

test("resolves one inline tap-note texture per column", async () => {
  const files: Record<string, string> = {
    "NoteSkin.lua": `
      local function createNote(direction)
        return Def.Sprite {
          Texture=NOTESKIN:GetPath("Notes/_" .. direction, "Tap Note"),
        }
      end
      return {}
    `,
  }
  for (const direction of ["Left", "Down", "Up", "Right"]) {
    files[`Notes/_${direction} Tap Note 1x1 (res 64x64).png`] = ""
  }

  await withSkin(files, async (directory) => {
    const result = await analyzeSkin(directory)

    expect(result.notes.left.filePath).toMatch(/_Left Tap Note/)
    expect(result.notes.down.filePath).toMatch(/_Down Tap Note/)
    expect(result.notes.up.filePath).toMatch(/_Up Tap Note/)
    expect(result.notes.right.filePath).toMatch(/_Right Tap Note/)
    expect(result.notes.left.frame).toBe(undefined)
  })
})

test("uses edge and middle frames from one shared 1xN sheet and applies enabled rotations", async () => {
  await withSkin(
    {
      "NoteSkin.lua": `
        local skin = {}
        skin.ButtonRedir = { Left="Down", Down="Down", Up="Down", Right="Down" }
        skin.Rotate = { Left=90, Down=0, Up=180, Right=-90 }
        skin.PartsToRotate = { ["Tap Note"]=true }
        return skin
      `,
      "Down Tap Note.lua": `
        return Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Tap Note") }
      `,
      "_Down Tap Note 1x8.png": "",
    },
    async (directory) => {
      const result = await analyzeSkin(directory)

      expect(result.notes.left.frame?.index).toBe(0)
      expect(result.notes.down.frame?.index).toBe(1)
      expect(result.notes.up.frame?.index).toBe(1)
      expect(result.notes.right.frame?.index).toBe(0)
      expect(
        Object.fromEntries(
          Object.entries(result.notes).map(([direction, note]) => [direction, note.rotation]),
        ),
      ).toStrictEqual({ left: 90, down: 0, up: 180, right: 270 })
    },
  )
})

test("uses frame zero from each Lua-selected 1xN sheet when more than one sheet is mapped", async () => {
  await withSkin(
    {
      "NoteSkin.lua": `
        local skin = {}
        skin.RedirTable = { Left="Down", Down="Down", Up="Up", Right="Down" }
        skin.Rotate = { Left=90, Down=0, Up=180, Right=-90 }
        skin.PartsToRotate = { ["Tap Note"]=false }
        return skin
      `,
      "Down Tap Note.lua": `
        return Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Tap Note") }
      `,
      "Up Tap Note.lua": `
        return Def.Sprite { Texture=NOTESKIN:GetPath("_up", "Tap Note") }
      `,
      "_Down Tap Note 1x8 (doubleres).png": "",
      "_Up Tap Note 1x8 (doubleres).png": "",
    },
    async (directory) => {
      const result = await analyzeSkin(directory)

      expect(result.notes.left.filePath).toMatch(/_Down Tap Note/)
      expect(result.notes.up.filePath).toMatch(/_Up Tap Note/)
      for (const note of Object.values(result.notes)) {
        expect(note.frame?.index).toBe(0)
        expect(note.rotation).toBe(0)
      }
    },
  )
})

test("resolves tap notes loaded directly by the NoteSkin Load function", async () => {
  await withSkin(
    {
      "NoteSkin.lua": `
        local skin = {}
        skin.ButtonRedir = { Left="Down", Down="Down", Up="Down", Right="Down" }
        function skin.Load()
          local sButton = Var "Button"
          local sElement = Var "Element"
          local Button = skin.ButtonRedir[sButton] or sButton
          local Element = sElement
          return LoadActor(NOTESKIN:GetPath(Button, Element))
        end
        return skin
      `,
      "_Down Tap Note 1x8.png": "",
    },
    async (directory) => {
      const result = await analyzeSkin(directory)

      expect(result.notes.left.filePath).toMatch(/_Down Tap Note/)
      expect(result.notes.left.frame?.index).toBe(0)
      expect(result.notes.down.frame?.index).toBe(1)
    },
  )
})

test("uses frame zero from a shared MxN sheet when M is greater than one", async () => {
  await withSkin(
    {
      "NoteSkin.lua": `
        local skin = {}
        skin.ButtonRedir = { Left="Down", Down="Down", Up="Down", Right="Down" }
        return skin
      `,
      "Down Tap Note.lua": `
        return Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Tap Note") }
      `,
      "_Down Tap Note 3x8.png": "",
    },
    async (directory) => {
      const result = await analyzeSkin(directory)

      for (const note of Object.values(result.notes)) {
        expect(note.frame).toStrictEqual({ index: 0, columns: 3, rows: 8 })
      }
    },
  )
})

test("warns when a Lua texture query resolves more than one physical image", async () => {
  await withSkin(
    {
      "NoteSkin.lua": `
        local skin = {}
        skin.ButtonRedir = { Left="Down", Down="Down", Up="Down", Right="Down" }
        return skin
      `,
      "Down Tap Note.lua": `
        return Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Tap Note") }
      `,
      "_Down Tap Note A 1x1.png": "",
      "_Down Tap Note B 1x1.png": "",
    },
    async (directory) => {
      const result = await analyzeSkin(directory)

      expectTruthy(result.diagnostics.length >= 1)
      expect(result.diagnostics[0]?.message ?? "").toMatch(/alternatives/i)
    },
  )
})

test("reports the direction when a tap note cannot be resolved", async () => {
  await withSkin(
    {
      "NoteSkin.lua": "return {}",
      "Down Tap Note.lua": `
        return Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Tap Note") }
      `,
      "_Down Tap Note.png": "",
    },
    async (directory) => {
      await expect((() => analyzeSkin(directory))()).rejects.toThrow(/direction left/i)
    },
  )
})
