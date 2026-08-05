import assert from "node:assert/strict"
import test from "node:test"
import { createDirectoryPicker, parseSelectedDirectory } from "./folder-picker.ts"

test("returns the selected directory", () => {
  assert.equal(parseSelectedDirectory(" C:\\Games\\Etterna \r\n"), "C:\\Games\\Etterna")
})

test("returns undefined when the dialog is cancelled", () => {
  assert.equal(parseSelectedDirectory("\r\n"), undefined)
})

test("preserves PowerShell failures with folder-picker context", async () => {
  const cause = new Error("powershell unavailable")
  const pickDirectory = createDirectoryPicker(async () => {
    throw cause
  })

  await assert.rejects(
    () => pickDirectory(),
    (error: unknown) => {
      assert(error instanceof Error)
      assert.match(error.message, /could not open the Windows folder picker/i)
      assert.equal(error.cause, cause)
      return true
    },
  )
})
