# Changesets

Every pull request must include a Changeset document unless it is the automated Release PR or
was authored by `dependabot[bot]`. Run `bun run changeset` for a public change and select its
SemVer impact. For maintenance-only work, run `bun run changeset --empty` so the pull
request records that no application release is required.

Changesets are consumed by the automated Release PR. Do not edit package versions or the
changelog manually.
