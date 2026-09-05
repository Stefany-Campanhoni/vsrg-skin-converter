import { test } from "bun:test"
import assert from "node:assert/strict"

import { assertPullRequestHasChangeset } from "../../.ci/quality/assert-pr-changeset.ts"

test("allows a Dependabot pull request to omit a Changeset", () => {
  assert.doesNotThrow(() =>
    assertPullRequestHasChangeset("dependabot/npm_and_yarn/example-1.0.0", [], "dependabot[bot]"),
  )
})

test("does not exempt a human pull request that uses a Dependabot-style branch", () => {
  assert.throws(
    () => assertPullRequestHasChangeset("dependabot/npm_and_yarn/example-1.0.0", [], "contributor"),
    /Every pull request must include a Changeset/u,
  )
})
