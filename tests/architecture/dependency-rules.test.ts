import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { analyzeArchitecture } from "./dependency-rules.ts"

test("production modules follow layer boundaries and contain no cycles", async () => {
  const violations = await analyzeArchitecture(path.resolve("src"))

  assert.deepEqual(violations, [])
})

test("application-root.ts belongs to the config boundary", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "vsrg-architecture-"))

  try {
    await mkdir(path.join(sourceRoot, "config"))
    await writeFile(
      path.join(sourceRoot, "application-root.ts"),
      "export const root = import.meta.url\n",
    )
    await writeFile(
      path.join(sourceRoot, "config", "paths.ts"),
      'export { root } from "../application-root.ts"\n',
    )

    assert.deepEqual(await analyzeArchitecture(sourceRoot), [])
  } finally {
    await rm(sourceRoot, { force: true, recursive: true })
  }
})

test("config modules still cannot depend on arbitrary root modules", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "vsrg-architecture-"))

  try {
    await mkdir(path.join(sourceRoot, "config"))
    await writeFile(path.join(sourceRoot, "other-root.ts"), "export const root = import.meta.url\n")
    await writeFile(
      path.join(sourceRoot, "config", "paths.ts"),
      'export { root } from "../other-root.ts"\n',
    )

    assert.deepEqual(await analyzeArchitecture(sourceRoot), [
      "Forbidden dependency: config/paths.ts (config) -> other-root.ts (root)",
    ])
  } finally {
    await rm(sourceRoot, { force: true, recursive: true })
  }
})
