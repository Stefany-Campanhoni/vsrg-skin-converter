import { expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import path from "node:path"

const sourceRoots = ["src", ".ci", "tests"] as const
const forbiddenRuntimeApis = [
  {
    pattern: /from\s+["']node:(?:child_process|stream(?:\/promises)?|url|util)["']/u,
    reason: "use the stable Bun-native runtime API",
  },
  {
    pattern: /\bprocess\.(?:argv|env|execPath)\b/u,
    reason: "use Bun.argv or Bun.env",
  },
] as const
test("controlled code uses Bun-native process, URL, and stream APIs", async () => {
  const violations: string[] = []

  for (const root of sourceRoots) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue
      const filePath = path.join(entry.parentPath, entry.name)
      const normalizedFilePath = filePath.replaceAll("\\", "/")
      const source = await Bun.file(filePath).text()
      for (const rule of forbiddenRuntimeApis) {
        if (rule.pattern.test(source)) {
          violations.push(`${normalizedFilePath}: ${rule.reason}`)
        }
      }
    }
  }

  expect(violations).toEqual([])
})
