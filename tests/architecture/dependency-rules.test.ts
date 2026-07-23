import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { analyzeArchitecture } from "./dependency-rules.ts"

test("production modules follow layer boundaries and contain no cycles", async () => {
  const violations = await analyzeArchitecture(path.resolve("src"))

  assert.deepEqual(violations, [])
})
