import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import packageJson from "../../package.json" with { type: "json" }

test("validates the branch Changeset before the shared pre-push quality gate", async () => {
  const [prePush, ci] = await Promise.all([
    readFile(new URL("../../.husky/pre-push", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  ])

  assert.equal(packageJson.scripts.prepare, "husky")
  assert.equal(
    packageJson.scripts.check,
    "npm test && npm run typecheck && npm run lint && npm run test:architecture && npx tsc --noEmit --noUnusedLocals --noUnusedParameters",
  )
  assert.equal(
    prePush.trim(),
    [
      'base_sha="$(git rev-parse origin/main)"',
      'head_sha="$(git rev-parse HEAD)"',
      'head_ref="$(git branch --show-current)"',
      'node .ci/quality/assert-pr-changeset.ts "$base_sha" "$head_sha" "$head_ref"',
      "npm run check",
    ].join("\n"),
  )
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
