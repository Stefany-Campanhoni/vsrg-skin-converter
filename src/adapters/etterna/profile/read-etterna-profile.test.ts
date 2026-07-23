import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import luaparse from "luaparse"
import { getGameplay4kCoordinates, readEtternaProfile } from "./read-etterna-profile.ts"

test("extracts the real 4K coordinates from a profile with multiple key modes", () => {
  const ast = luaparse.parse(`
    return {
      CurrentWidth = 1280,
      ScreenFilter = 1,
      GameplayXYCoordinates = {
        ["10K"] = {
          JudgmentY = 0,
          ComboY = -30,
          NoteFieldY = 0
        },
        ["12K"] = {
          JudgmentY = 0,
          ComboY = -30,
          NoteFieldY = 0
        },
        ["16K"] = {
          JudgmentY = 0,
          ComboY = -30,
          NoteFieldY = 0
        },
        ["3K"] = {
          JudgmentY = 0,
          ComboY = -30,
          NoteFieldY = 0
        },
        ["4K"] = {
          JudgmentX = 2.800497,
          JudgmentY = 4.199984,
          ComboX = 3.540852,
          ComboY = -20.800002,
          NoteFieldX = 0,
          NoteFieldY = -6
        },
        ["5K"] = {
          JudgmentY = 0,
          ComboY = -30,
          NoteFieldY = 0
        }
      },
      ReceptorSize = 106,
      CurrentHeight = 720
    }
  `)

  assert.deepEqual(getGameplay4kCoordinates(ast), {
    hitPosition: -6,
    judgementPosition: 4.199984,
    comboPosition: -20.800002,
    columnWidth: 106,
  })
})

test("does not mistake another key containing 4k for the 4k key", () => {
  const ast = luaparse.parse(`
    return {
      GameplayXYCoordinates = {
        ["14k"] = {
          NoteFieldY = 1,
          JudgmentY = 2,
          ComboY = 3
        }
      }
    }
  `)

  assert.throws(
    () => getGameplay4kCoordinates(ast),
    /Expected GameplayXYCoordinates\["4k"\] to be a Lua table/,
  )
})

test("rejects a missing numeric coordinate instead of returning zero", () => {
  const ast = luaparse.parse(`
    return {
      GameplayXYCoordinates = {
        ["4k"] = {
          NoteFieldY = 1,
          JudgmentY = 2
        }
      }
    }
  `)

  assert.throws(() => getGameplay4kCoordinates(ast), /Expected "ComboY" to be a numeric value/)
})

test("rejects a missing receptor size", () => {
  const ast = luaparse.parse(`
    return {
      GameplayXYCoordinates = {
        ["4k"] = {
          NoteFieldY = 1,
          JudgmentY = 2,
          ComboY = 3
        }
      }
    }
  `)

  assert.throws(
    () => getGameplay4kCoordinates(ast),
    /Expected "ReceptorSize" to be a numeric value/,
  )
})

test("discovers playerConfig.lua case-insensitively instead of using another Lua file", async () => {
  const gameRoot = await mkdtemp(path.join(os.tmpdir(), "vsrg-profile-"))
  const profileDirectory = path.join(
    gameRoot,
    "Save",
    "LocalProfiles",
    "00000000",
    "Rebirth_settings",
  )
  try {
    await mkdir(profileDirectory, { recursive: true })
    await writeFile(path.join(profileDirectory, "ignored.lua"), "not valid lua")
    await writeFile(
      path.join(profileDirectory, "PLAYERCONFIG.LUA"),
      `
        return {
          GameplayXYCoordinates = {
            ["4K"] = {
              NoteFieldY = -6,
              JudgmentY = 4,
              ComboY = -20
            }
          },
          ReceptorSize = 106
        }
      `,
    )

    assert.deepEqual(await readEtternaProfile(gameRoot), {
      hitPosition: -6,
      judgementPosition: 4,
      comboPosition: -20,
      columnWidth: 106,
    })
  } finally {
    await rm(gameRoot, { recursive: true, force: true })
  }
})
