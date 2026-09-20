# Bun Migration Implementation Plan

## Git workflow

The integration branch is `codex/bun-migration`, forked from `origin/main`. Git cannot store
a branch below an existing branch ref, so task branches use the flat form
`codex/bun-migration-tNN-name`. Each main task starts from the latest integration commit,
uses its own worktree, adds a Changeset, and opens a Conventional Commit pull request back to
the integration branch. Tasks are squash-merged sequentially.

The standalone experiment is the only optional leaf. It starts after the core migration is
green and is merged only after manual approval.

## Tasks

| ID | Branch | Pull request title | Required outcome | Changeset |
| --- | --- | --- | --- | --- |
| 00 | `codex/bun-migration-t00-prd` | `docs: define Bun migration program` | Persist PRD and plan | Empty |
| 01 | `codex/bun-migration-t01-bootstrap` | `build: bootstrap Bun 1.4 toolchain` | Add pinned Bun, lockfile, types, and transitional CI | Empty |
| 02 | `codex/bun-migration-t02-test-runner` | `test: migrate lifecycle to bun:test` | Replace `node:test`, adapt lifecycle/subtests/skips, fix Bun compatibility | Empty |
| 03 | `codex/bun-migration-t03-unit-expect` | `test: migrate unit assertions to bun:test` | Replace unit assertions below `src` | Empty |
| 04 | `codex/bun-migration-t04-system-expect` | `test: migrate system assertions to bun:test` | Replace integration, architecture, repository, and distribution assertions | Empty |
| 05 | `codex/bun-migration-t05-binary-crypto` | `refactor: adopt Bun-native binary and crypto APIs` | Adopt typed bytes, Bun hashing, and Web Crypto with byte/pixel parity | Empty |
| 06 | `codex/bun-migration-t06-native-runtime-apis` | `refactor: adopt Bun-native runtime APIs` | Adopt Bun process, URL, stream, and safe file APIs; document fallbacks | Empty |
| 07 | `codex/bun-migration-t07-toolchain-cutover` | `build: switch repository tooling to Bun` | Remove repository-owned Node/npm/npx tooling | Empty |
| 08 | `codex/bun-migration-t08-portable` | `build: ship Bun in the Windows portable distribution` | Build and verify the supported Bun ZIP | Minor |
| 09 | `codex/bun-migration-t09-release` | `ci: migrate versioning and release automation to Bun` | Adapt Changesets, release detection, tag, and draft flow | Empty |
| 10 | `codex/bun-migration-t10-guardrails` | `docs: enforce the Bun-first runtime contract` | Document Bun and enforce the first-party Node allowlist | Empty |
| 11 | `codex/bun-migration-t11-standalone-manual` | `build: add manual Bun standalone experiment` | Produce a local-only candidate and smoke instructions, with no workflow changes | Empty |

## Per-task execution contract

1. Rebase the task branch on the latest `codex/bun-migration` before implementation.
2. For behavior changes, write a focused failing test and observe the intended failure.
3. Implement the smallest passing change and run the affected suite.
4. Run type-checking, lint, architecture checks, and `git diff --check` as applicable.
5. Add the task Changeset and use the table's exact Conventional Commit PR title.
6. Request read-only code review, address Critical and Important findings, then push and open
   the PR against `codex/bun-migration`.
7. Wait for required GitHub checks before squash-merging and starting the next task.

## Core final gate

Run from a clean checkout with Node absent from `PATH`:

```text
bun --version
bun ci
bun test
bun run typecheck
bun run lint
bun run test:architecture
bun run build:windows
bun run test:distribution
bun run release:windows
git diff --check
```

Inspect the final ZIP manifest and checksum after independent extraction. Run both conversion
integration directions and the real Sharp smoke. The final integration PR targets `main`;
after merge, Changesets owns the Release PR that calculates version `1.1.0`.
