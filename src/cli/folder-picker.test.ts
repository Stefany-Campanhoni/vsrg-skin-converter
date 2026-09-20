import { expect, test } from "bun:test"
import { expectRejectionSatisfies, expectTruthy } from "../../tests/support/expectations.ts"
import { createDirectoryPicker, parseSelectedDirectory } from "./folder-picker.ts"

test("returns the selected directory", () => {
  expect(parseSelectedDirectory(" C:\\Games\\Etterna \r\n")).toBe("C:\\Games\\Etterna")
})

test("returns undefined when the dialog is cancelled", () => {
  expect(parseSelectedDirectory("\r\n")).toBe(undefined)
})

test("preserves PowerShell failures with folder-picker context", async () => {
  const cause = new Error("powershell unavailable")
  const pickDirectory = createDirectoryPicker(async () => {
    throw cause
  })

  await expectRejectionSatisfies((() => pickDirectory())(), (error) => {
    expectTruthy(error instanceof Error)
    expect(error.message).toMatch(/could not open the Windows folder picker/i)
    expect(error.cause).toBe(cause)
    return true
  })
})
