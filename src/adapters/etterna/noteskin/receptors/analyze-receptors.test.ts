import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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

      expect(result.receptors.left.normal.filePath).toBe(result.receptors.down.normal.filePath)
      expect(result.receptors.up.pressed.filePath).toBe(result.receptors.down.pressed.filePath)
      expect(result.receptors.down.normal.rotation).toBe(0)
      expect(result.receptors.left.normal.rotation).toBe(90)
      expect(result.receptors.up.normal.rotation).toBe(180)
      expect(result.receptors.right.normal.rotation).toBe(270)
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

      expect(result.receptors.left.normal.filePath).toMatch(/_receptor\.png$/)
      expect(result.receptors.left.normal.rotation).toBe(90)
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

    expect(result.receptors.left.normal.filePath).toMatch(/_Left Go Receptor\.png$/)
    expect(result.receptors.up.pressed.filePath).toMatch(/_Up Press Receptor\.png$/)
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
      await expect(
        (async () => analyzeEtternaReceptors(await loadNoteSkinContext(directory)))(),
      ).rejects.toThrow(/direction left|left receptor/i)
    },
  )
})
