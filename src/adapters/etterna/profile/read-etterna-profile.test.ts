import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import luaparse from "luaparse"
import { extractEtternaPlayfieldConfiguration, readEtternaProfile } from "./read-etterna-profile.ts"

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
      GameplaySizes = {
        ["4K"] = { JudgmentZoom = 0.35, ComboZoom = 0.6 },
      },
      ReceptorSize = 106,
      CurrentHeight = 720
    }
  `)

  assert.deepEqual(extractEtternaPlayfieldConfiguration(ast), {
    hitPosition: -6,
    judgementPosition: 4.199984,
    comboPosition: -20.800002,
    columnWidth: 106,
    judgementScale: 0.675,
    comboScale: 0.6,
  })
})

test("uses the last repeated Lua fields when extracting the playfield configuration", () => {
  const ast = luaparse.parse(`
    return {
      GameplayXYCoordinates = {
        ["4k"] = {
          NoteFieldY = 100,
          NoteFieldY = -6,
          JudgmentY = 100,
          JudgmentY = 4,
          ComboY = 100,
          ComboY = -20
        }
      },
      GameplaySizes = {
        ["4K"] = {
          JudgmentZoom = 1,
          JudgmentZoom = 0.35,
          ComboZoom = 1,
          ComboZoom = 0.6
        }
      },
      ReceptorSize = 100,
      ReceptorSize = 106
    }
  `)

  assert.deepEqual(extractEtternaPlayfieldConfiguration(ast), {
    hitPosition: -6,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 106,
    judgementScale: 0.675,
    comboScale: 0.6,
  })
})

test('rejects a missing GameplaySizes["4K"] table', () => {
  const ast = luaparse.parse(`
    return {
      GameplayXYCoordinates = {
        ["4K"] = {
          NoteFieldY = 1,
          JudgmentY = 2,
          ComboY = 3
        }
      },
      GameplaySizes = {},
      ReceptorSize = 106
    }
  `)

  assert.throws(
    () => extractEtternaPlayfieldConfiguration(ast),
    /Expected GameplaySizes\["4K"\] to be a Lua table/,
  )
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
    () => extractEtternaPlayfieldConfiguration(ast),
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
      },
      GameplaySizes = {
        ["4K"] = { JudgmentZoom = 1, ComboZoom = 1 }
      }
    }
  `)

  assert.throws(
    () => extractEtternaPlayfieldConfiguration(ast),
    /Expected "ComboY" to be a numeric value/,
  )
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
      },
      GameplaySizes = {
        ["4K"] = { JudgmentZoom = 1, ComboZoom = 1 }
      }
    }
  `)

  assert.throws(
    () => extractEtternaPlayfieldConfiguration(ast),
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
          GameplaySizes = {
            ["4K"] = { JudgmentZoom = 1, ComboZoom = 1 }
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
      judgementScale: 1,
      comboScale: 1,
    })
  } finally {
    await rm(gameRoot, { recursive: true, force: true })
  }
})

test("adds the playerConfig path and cause when profile parsing fails", async () => {
  const gameRoot = await mkdtemp(path.join(os.tmpdir(), "vsrg-profile-invalid-"))
  const profileDirectory = path.join(
    gameRoot,
    "Save",
    "LocalProfiles",
    "00000000",
    "Rebirth_settings",
  )
  const profilePath = path.join(profileDirectory, "playerConfig.lua")
  try {
    await mkdir(profileDirectory, { recursive: true })
    await writeFile(profilePath, "return { GameplayXYCoordinates = {")

    await assert.rejects(
      () => readEtternaProfile(gameRoot),
      (error) =>
        error instanceof Error &&
        error.message.includes(profilePath) &&
        error.cause instanceof Error,
    )
  } finally {
    await rm(gameRoot, { recursive: true, force: true })
  }
})
