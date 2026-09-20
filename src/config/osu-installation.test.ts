import { expect, test } from "bun:test"
import path from "node:path"
import { resolveDefaultOsuInstallationDirectory } from "./osu-installation.ts"

test("resolves the default osu! installation from LOCALAPPDATA", () => {
  expect(resolveDefaultOsuInstallationDirectory("C:/Users/Alice/AppData/Local")).toBe(
    path.join("C:/Users/Alice/AppData/Local", "osu!"),
  )
})

test("returns no default osu! installation when LOCALAPPDATA is unavailable", () => {
  expect(resolveDefaultOsuInstallationDirectory(undefined)).toBe(undefined)
  expect(resolveDefaultOsuInstallationDirectory("  ")).toBe(undefined)
})

test("rejects a relative LOCALAPPDATA root", () => {
  expect(() => resolveDefaultOsuInstallationDirectory("relative/local-app-data")).toThrow(
    /absolute LOCALAPPDATA/i,
  )
})
