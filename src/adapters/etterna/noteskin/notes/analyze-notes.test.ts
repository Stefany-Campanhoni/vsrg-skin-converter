import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
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

    assert.match(result.notes.left.filePath, /_Left Tap Note/)
    assert.match(result.notes.down.filePath, /_Down Tap Note/)
    assert.match(result.notes.up.filePath, /_Up Tap Note/)
    assert.match(result.notes.right.filePath, /_Right Tap Note/)
    assert.equal(result.notes.left.frame, undefined)
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

      assert.equal(result.notes.left.frame?.index, 0)
      assert.equal(result.notes.down.frame?.index, 1)
      assert.equal(result.notes.up.frame?.index, 1)
      assert.equal(result.notes.right.frame?.index, 0)
      assert.deepEqual(
        Object.fromEntries(
          Object.entries(result.notes).map(([direction, note]) => [direction, note.rotation]),
        ),
        { left: 90, down: 0, up: 180, right: 270 },
      )
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

      assert.match(result.notes.left.filePath, /_Down Tap Note/)
      assert.match(result.notes.up.filePath, /_Up Tap Note/)
      for (const note of Object.values(result.notes)) {
        assert.equal(note.frame?.index, 0)
        assert.equal(note.rotation, 0)
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

      assert.match(result.notes.left.filePath, /_Down Tap Note/)
      assert.equal(result.notes.left.frame?.index, 0)
      assert.equal(result.notes.down.frame?.index, 1)
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
        assert.deepEqual(note.frame, { index: 0, columns: 3, rows: 8 })
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

      assert.ok(result.diagnostics.length >= 1)
      assert.match(result.diagnostics[0]?.message ?? "", /alternatives/i)
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
      await assert.rejects(() => analyzeSkin(directory), /direction left/i)
    },
  )
})
