# Changesets

Every pull request must include a Changeset document. Run `npm run changeset` for a public
change and select its SemVer impact. For maintenance-only work, run
`npm run changeset -- --empty` so the pull request records that no application release is
required.

Changesets are consumed by the automated Release PR. Do not edit package versions or the
changelog manually.
