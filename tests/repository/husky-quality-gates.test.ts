import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import packageJson from "../../package.json" with { type: "json" }

test("shares the full quality gate between CI and the pre-push hook", async () => {
  const [prePush, ci] = await Promise.all([
    readFile(new URL("../../.husky/pre-push", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  ])

  assert.equal(packageJson.scripts.prepare, "husky")
  assert.equal(
    packageJson.scripts.check,
    "npm test && npm run typecheck && npm run lint && npm run test:architecture && npx tsc --noEmit --noUnusedLocals --noUnusedParameters",
  )
  assert.equal(prePush.trim(), "npm run check")
  assert.match(ci, /run: npm run check/)
  assert.match(ci, /git diff --check/)
})

test("runs fast code and staged-whitespace checks before commit", async () => {
  const preCommit = await readFile(new URL("../../.husky/pre-commit", import.meta.url), "utf8")

  assert.equal(
    packageJson.scripts["check:staged"],
    "npm run lint && npm run typecheck && git diff --cached --check",
  )
  assert.equal(preCommit.trim(), "npm run check:staged")
})
