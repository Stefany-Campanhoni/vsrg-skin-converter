import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { loadNoteSkinContext } from "../note-skin-context.ts"
import { analyzeEtternaReceptors } from "./analyze-receptors.ts"

async function withSkin(
  files: Record<string, string>,
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-noteskin-"))
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

test("resolves external receptors through ButtonRedir and applies per-direction rotation", async () => {
  await withSkin(
    {
      "NoteSkin.lua": `
        local skin = {}
        skin.ButtonRedir = { Up="Down", Down="Down", Left="Down", Right="Down" }
        skin.Rotate = { Up=180, Down=0, Left=90, Right=-90 }
        function skin.Load()
          local Button = skin.ButtonRedir[Var "Button"]
          return LoadActor(NOTESKIN:GetPath(Button, "Receptor"))
        end
        return skin
      `,
      "Down Receptor.lua": `
        return Def.ActorFrame {
          Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Go Receptor") },
          Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Press Receptor") },
        }
      `,
      "_Down Go Receptor.png": "",
      "_Down Press Receptor.png": "",
    },
    async (directory) => {
      const result = await analyzeEtternaReceptors(await loadNoteSkinContext(directory))

      assert.equal(result.receptors.left.normal.filePath, result.receptors.down.normal.filePath)
      assert.equal(result.receptors.up.pressed.filePath, result.receptors.down.pressed.filePath)
      assert.equal(result.receptors.down.normal.rotation, 0)
      assert.equal(result.receptors.left.normal.rotation, 90)
      assert.equal(result.receptors.up.normal.rotation, 180)
      assert.equal(result.receptors.right.normal.rotation, 270)
    },
  )
})

test("supports legacy RedirTable direction mappings", async () => {
  await withSkin(
    {
      "NoteSkin.lua": `
        local skin = {}
        skin.RedirTable = { Up="Down", Down="Down", Left="Down", Right="Down" }
        skin.Rotate = { Up=180, Down=0, Left=90, Right=-90 }
        return skin
      `,
      "Down Receptor.lua": `
        return Def.ActorFrame {
          Def.Sprite { Texture="_receptor" },
          Def.Sprite {
            Texture="_rflash",
            PressCommand=NOTESKIN:GetMetricA("ReceptorOverlay", "PressCommand"),
          },
        }
      `,
      "_receptor.png": "",
      "_rflash.png": "",
    },
    async (directory) => {
      const result = await analyzeEtternaReceptors(await loadNoteSkinContext(directory))

      assert.match(result.receptors.left.normal.filePath, /_receptor\.png$/)
      assert.equal(result.receptors.left.normal.rotation, 90)
    },
  )
})

test("analyzes an inline createReceptor function for every direction", async () => {
  const files: Record<string, string> = {
    "NoteSkin.lua": `
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
      local skin = {}
      skin.ButtonRedir = { Up="Up", Down="Down", Left="Left", Right="Right" }
      skin.Rotate = { Up=0, Down=0, Left=0, Right=0 }
      function skin.Load()
        return createReceptor(Var "Button")
      end
      return skin
    `,
  }
  for (const direction of ["Left", "Down", "Up", "Right"]) {
    files[`Receptors/_${direction} Go Receptor.png`] = ""
    files[`Receptors/_${direction} Press Receptor.png`] = ""
  }

  await withSkin(files, async (directory) => {
    const result = await analyzeEtternaReceptors(await loadNoteSkinContext(directory))

    assert.match(result.receptors.left.normal.filePath, /_Left Go Receptor\.png$/)
    assert.match(result.receptors.up.pressed.filePath, /_Up Press Receptor\.png$/)
  })
})

test("reports the direction when either receptor state is missing", async () => {
  await withSkin(
    {
      "NoteSkin.lua": `return {}`,
      "Down Receptor.lua": `
        return Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Go Receptor") }
      `,
      "_Down Go Receptor.png": "",
    },
    async (directory) => {
      await assert.rejects(
        async () => analyzeEtternaReceptors(await loadNoteSkinContext(directory)),
        /direction left|left receptor/i,
      )
    },
  )
})
