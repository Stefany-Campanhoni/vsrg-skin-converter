import assert from "node:assert/strict"
import test from "node:test"
import { assertPullRequestHasChangeset } from "../../.ci/quality/assert-pr-changeset.ts"

test("accepts a Changesets release pull request after source changesets are consumed", () => {
  assert.doesNotThrow(() =>
    assertPullRequestHasChangeset("changeset-release/main", ["package.json", "CHANGELOG.md"]),
  )
})

test("accepts a newly added Changeset document", () => {
  assert.doesNotThrow(() =>
    assertPullRequestHasChangeset("feature/notes", [
      "src/feature.ts",
      ".changeset/calm-notes-dance.md",
    ]),
  )
})

test("normalizes Windows separators in changed paths", () => {
  assert.doesNotThrow(() =>
    assertPullRequestHasChangeset("fix/receptor", [".changeset\\bright-arrows-smile.md"]),
  )
})

test("does not treat the Changesets README as a release intent", () => {
  assert.throws(
    () => assertPullRequestHasChangeset("docs/setup", [".changeset/README.md"]),
    /must include a Changeset/i,
  )
})

test("rejects a pull request without a Changeset", () => {
  assert.throws(
    () => assertPullRequestHasChangeset("feature/notes", ["src/feature.ts"]),
    /npm run changeset/i,
  )
})
