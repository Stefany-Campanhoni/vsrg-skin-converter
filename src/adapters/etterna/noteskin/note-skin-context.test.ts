import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadNoteSkinContext } from "./note-skin-context.ts"

test("loads shared redirects, rotations, rotation flags, and inline functions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-noteskin-context-"))
  try {
    const noteSkinPath = path.join(directory, "NoteSkin.lua")
    await writeFile(
      noteSkinPath,
      `
        local function createNote(direction)
          return Def.Sprite {
            Texture=NOTESKIN:GetPath("_" .. direction, "Tap Note"),
          }
        end
        local skin = {}
        skin.RedirTable = { Left="Down", Down="Down" }
        skin.ButtonRedir = { Up="Up", Right="Down" }
        skin.Rotate = { Left=90, Down=0, Up=180, Right=-90 }
        skin.PartsToRotate = {
          ["Tap Note"]=true,
          Receptor=false,
        }
        return skin
      `,
    )

    const context = await loadNoteSkinContext(directory)

    assert.equal(context.filePath, noteSkinPath)
    assert.deepEqual(context.buttonRedirections, {
      left: "Down",
      down: "Down",
      up: "Up",
      right: "Down",
    })
    assert.deepEqual(context.rotations, {
      left: 90,
      down: 0,
      up: 180,
      right: -90,
    })
    assert.equal(context.partsToRotate["Tap Note"], true)
    assert.equal(context.partsToRotate.Receptor, false)
    assert.match(context.getFunctionSource("createNote") ?? "", /function createNote/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("finds NoteSkin.lua case-insensitively", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-noteskin-context-"))
  try {
    await writeFile(path.join(directory, "Noteskin.lua"), "return {}")

    const context = await loadNoteSkinContext(directory)

    assert.match(context.filePath, /Noteskin\.lua$/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
