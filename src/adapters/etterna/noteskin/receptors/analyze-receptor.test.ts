import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createSkinFileResolver } from "../resolve-skin-files.ts"
import { analyzeReceptorLua } from "./analyze-receptor.ts"

async function analyze(
  files: Record<string, string>,
  source: string,
  variables: Record<string, string> = {},
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-receptor-"))
  try {
    await Promise.all(
      Object.entries(files).map(([name, contents]) =>
        writeFile(path.join(directory, name), contents),
      ),
    )
    const resolver = await createSkinFileResolver(directory)
    return analyzeReceptorLua({
      source,
      filePath: path.join(directory, "Down Receptor.lua"),
      direction: "down",
      variables,
      resolver,
      rotation: 0,
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("uses explicit visibility transitions to identify normal and pressed sprites", async () => {
  const result = await analyze(
    {
      "_Down Release.png": "",
      "_Down Pressed.png": "",
    },
    `
      return Def.ActorFrame {
        Def.Sprite {
          Texture=NOTESKIN:GetPath("_down", "Release"),
          PressCommand=function(self) self:visible(false) end,
          LiftCommand=function(self) self:visible(true) end,
        },
        Def.Sprite {
          Texture=NOTESKIN:GetPath("_down", "Pressed"),
          PressCommand=function(self) self:visible(true) end,
          LiftCommand=function(self) self:visible(false) end,
        },
      }
    `,
  )

  assert.match(result.receptor.normal.filePath, /Release\.png$/)
  assert.match(result.receptor.pressed.filePath, /Pressed\.png$/)
  assert.deepEqual(result.warnings, [])
})

test("uses a ReceptorOverlay sprite as the pressed image only", async () => {
  const result = await analyze(
    {
      "_Down Go Receptor.png": "",
      "_Down tap Flash.png": "",
    },
    `
      return Def.ActorFrame {
        Def.Sprite {
          Texture=NOTESKIN:GetPath("_down", "Go Receptor"),
          NoneCommand=NOTESKIN:GetMetricA("ReceptorArrow", "NoneCommand"),
        },
        Def.Sprite {
          Texture=NOTESKIN:GetPath("_down", "tap Flash"),
          InitCommand=NOTESKIN:GetMetricA("ReceptorOverlay", "InitCommand"),
          PressCommand=NOTESKIN:GetMetricA("ReceptorOverlay", "PressCommand"),
        },
      }
    `,
  )

  assert.match(result.receptor.normal.filePath, /Go Receptor\.png$/)
  assert.match(result.receptor.pressed.filePath, /tap Flash\.png$/)
})

test("maps frame zero and one of a lone 2x1 receptor to normal and pressed", async () => {
  const result = await analyze(
    { "_Down Receptor 2x1.png": "" },
    `
      return Def.Sprite {
        Texture=NOTESKIN:GetPath("_down", "Receptor"),
        Frame0000=0,
        Frame0001=1,
      }
    `,
  )

  assert.deepEqual(result.receptor.normal.frame, { index: 0, columns: 2, rows: 1 })
  assert.deepEqual(result.receptor.pressed.frame, { index: 1, columns: 2, rows: 1 })
})

test("uses an unnamed base sprite as normal when another sprite is an explicit overlay", async () => {
  const result = await analyze(
    { "Receptor 4x1 (doubleres).png": "" },
    `
      return Def.ActorFrame {
        Def.Sprite {
          Texture="Receptor 4x1 (doubleres).png",
          Frame0000=0,
        },
        Def.Sprite {
          Texture="Receptor 4x1 (doubleres).png",
          Frame0000=1,
          PressCommand=NOTESKIN:GetMetricA("ReceptorOverlay", "PressCommand"),
        },
      }
    `,
  )

  assert.deepEqual(result.receptor.normal.frame, { index: 0, columns: 4, rows: 1 })
  assert.deepEqual(result.receptor.pressed.frame, { index: 1, columns: 4, rows: 1 })
})

test("evaluates concatenated texture paths and warns about lower-confidence alternatives", async () => {
  const result = await analyze(
    {
      "_Down Go Receptor.png": "",
      "_Down Normal.png": "",
      "_Down Press Receptor.png": "",
    },
    `
      return Def.ActorFrame {
        Def.Sprite { Texture=NOTESKIN:GetPath("_" .. Button, "Normal") },
        Def.Sprite {
          Texture=NOTESKIN:GetPath("_" .. Button, "Go Receptor"),
          PressCommand=function(self) self:visible(false) end,
          LiftCommand=function(self) self:visible(true) end,
        },
        Def.Sprite { Texture=NOTESKIN:GetPath("_" .. Button, "Press Receptor") },
      }
    `,
    { Button: "Down" },
  )

  assert.match(result.receptor.normal.filePath, /Go Receptor\.png$/)
  assert.match(result.receptor.pressed.filePath, /Press Receptor\.png$/)
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0] ?? "", /normal.*alternative/i)
})

test("fails with a diagnostic when a receptor state cannot be identified", async () => {
  await assert.rejects(
    () =>
      analyze(
        { "_Down Go Receptor.png": "" },
        `return Def.Sprite { Texture=NOTESKIN:GetPath("_down", "Go Receptor") }`,
      ),
    /pressed receptor.*Down Receptor\.lua/i,
  )
})
