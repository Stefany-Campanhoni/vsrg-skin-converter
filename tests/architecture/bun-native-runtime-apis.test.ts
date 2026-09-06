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
const transitionalPortableFile = ".ci/release/build-application.ts"
const transitionalPortableShim =
  "globalThis.Bun ??= { argv: globalThis.process" + ".argv, env: globalThis.process" + ".env };"

test("controlled code uses Bun-native process, URL, and stream APIs", async () => {
  const violations: string[] = []

  for (const root of sourceRoots) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue
      const filePath = path.join(entry.parentPath, entry.name)
      const normalizedFilePath = filePath.replaceAll("\\", "/")
      let source = await Bun.file(filePath).text()
      if (normalizedFilePath === transitionalPortableFile) {
        const shimOccurrences = source.split(transitionalPortableShim).length - 1
        if (shimOccurrences !== 1) {
          violations.push(`${normalizedFilePath}: keep the exact transitional portable shim`)
        }
        source = source.replace(transitionalPortableShim, "")
      }
      for (const rule of forbiddenRuntimeApis) {
        if (rule.pattern.test(source)) {
          violations.push(`${normalizedFilePath}: ${rule.reason}`)
        }
      }
    }
  }

  expect(violations).toEqual([])
})
