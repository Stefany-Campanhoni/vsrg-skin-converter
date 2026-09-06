import { expect, test } from "bun:test"

import { assertPullRequestHasChangeset } from "../../.ci/quality/assert-pr-changeset.ts"

test("allows a Dependabot pull request to omit a Changeset", () => {
  expect(() =>
    assertPullRequestHasChangeset("dependabot/npm_and_yarn/example-1.0.0", [], "dependabot[bot]"),
  ).not.toThrow()
})

test("does not exempt a human pull request that uses a Dependabot-style branch", () => {
  expect(() =>
    assertPullRequestHasChangeset("dependabot/npm_and_yarn/example-1.0.0", [], "contributor"),
  ).toThrow(/Every pull request must include a Changeset/u)
})
