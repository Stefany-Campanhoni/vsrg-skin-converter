import { expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import path from "node:path"

const recursiveRoots = [".ci", ".github", ".husky", "src", "tests"] as const
const documentationFiles = [
  "AGENTS.md",
  "CONTRIBUTING.md",
  "readme.md",
  "docs/architecture.md",
  "docs/development-standards.md",
] as const
const excludedFiles = new Set(["tests/architecture/bun-toolchain.test.ts"])
const forbiddenTooling = [
  [new RegExp("\\b" + "n" + "pm\\b", "iu"), "use Bun as the package manager"],
  [new RegExp("\\b" + "n" + "px\\b", "iu"), "use bunx for package executables"],
  [new RegExp("actions/setup-" + "node@", "iu"), "set up pinned Bun instead of Node"],
  [new RegExp("bun-" + "compatibility", "u"), "remove the completed migration-only CI job"],
  [new RegExp("package-" + "lock\\.json", "iu"), "use bun.lock as the only lockfile"],
  [new RegExp("\\b" + "node\\s+(?:\\.ci|src[/\\\\])", "iu"), "run first-party code with Bun"],
] as const

async function collectControlledFiles(): Promise<string[]> {
  const files: string[] = [...documentationFiles]
  for (const root of recursiveRoots) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const file = path.join(entry.parentPath, entry.name).replaceAll("\\", "/")
      if (excludedFiles.has(file) || file.endsWith("/bun.lock")) continue
      files.push(file)
    }
  }
  files.push("package.json")
  return files
}

test("repository-owned tooling is Bun-only", async () => {
  const violations: string[] = []
  const legacyLockfileName = "package-" + "lock.json"
  for (const lockfile of [
    legacyLockfileName,
    `.ci/release/runtime-package/${legacyLockfileName}`,
  ]) {
    if (await Bun.file(lockfile).exists())
      violations.push(`${lockfile}: remove the legacy lockfile`)
  }

  for (const file of await collectControlledFiles()) {
    const source = await Bun.file(file).text()
    for (const [pattern, reason] of forbiddenTooling) {
      if (pattern.test(source)) violations.push(`${file}: ${reason}`)
    }
  }

  expect(violations).toEqual([])
})
