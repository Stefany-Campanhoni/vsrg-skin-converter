import assert from "node:assert/strict"
import { test } from "node:test"
import luaparse from "luaparse"
import { getGameplay4kCoordinates } from "./read-etterna-profile.ts"

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
      CurrentHeight = 720
    }
  `)

  assert.deepEqual(getGameplay4kCoordinates(ast), {
    hitPosition: -6,
    judgementPosition: 4.199984,
    comboPosition: -20.800002,
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
