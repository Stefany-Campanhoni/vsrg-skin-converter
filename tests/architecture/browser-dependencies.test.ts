import { expect, test } from "bun:test"
import { analyzeBrowserDependencies, inspectBrowserModule } from "./browser-dependency-rules.ts"

test("browser graph detects platform APIs and native wrappers", () => {
  for (const source of [
    'import sharp from "sharp"',
    'import fs from "node:fs"',
    'import { read } from "../native-reader.ts"',
    'import { main } from "../cli/main.ts"',
    'const bytes=Bun.file("x")',
  ])
    expect(inspectBrowserModule("fixture", source)).toHaveLength(1)
  expect(inspectBrowserModule("fixture", 'import { policy } from "../adapters/policy.ts"')).toEqual(
    [],
  )
})
test("browser entrypoints and their adapter/core graph are platform-free", async () => {
  for (const entry of [
    "src/web/main.ts",
    "src/web/conversion-worker.ts",
    "src/web/web-conversion.ts",
  ])
    expect(await analyzeBrowserDependencies(entry)).toEqual([])
})
