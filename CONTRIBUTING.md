# Contributing to VSRG Skin Converter

Thank you for helping improve the converter. Changes should preserve both conversion
directions, the transactional publication guarantees, and the supported Windows release.

## Development Setup

Requirements:

- Windows 10 or newer;
- Node.js 22.18 or newer;
- npm from the selected Node.js installation.

Install the exact dependency tree:

```powershell
npm ci
```

Run the interactive application with `npm start` or use `npm run dev` while developing.

## Architecture and Code Standards

Read [the architecture](docs/architecture.md) and
[the development standards](docs/development-standards.md) before changing code. In
particular:

- keep Etterna and osu! parsing and output policy in their respective adapters;
- keep cross-game equivalences in the applicable conversion module;
- keep generic filesystem and image mechanisms in infrastructure;
- keep CLI interaction separate from conversion and installation behavior;
- keep repository quality and release automation under the applicable `.ci` subdirectory;
- preserve contextual errors, async quiescence, path validation, and transactional output;
- write technical identifiers, diagnostics, comments, and documentation in English.

Use test-driven development for behavior changes: write a focused failing test, confirm it
fails for the intended reason, implement the smallest change, and confirm the complete suite
remains green.

## Required Verification

`npm ci` installs the repository's Husky hooks. Before each commit, Husky runs lint,
type-checking, and staged whitespace validation. Before each push, it runs the complete
quality gate:

```powershell
npm run check
```

The hooks are a local feedback mechanism, not a substitute for CI. The `windows-quality`
GitHub check runs the same complete gate for every pull request and push to `main`.

The complete gate is equivalent to:

```powershell
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
```

Changes to release assembly additionally require the release verification commands listed in
`docs/development-standards.md`. Changes to a conversion route must run its integration test;
changes to shared behavior must run both directions.

## Pull Requests

Keep each pull request focused on one coherent outcome. Describe:

- the observable behavior and conversion direction affected;
- the tests that failed before the change and pass afterward;
- compatibility evidence for representative real skins when applicable;
- filesystem, rollback, or security implications;
- documentation and release impact.

Do not include generated `build`, `release`, cache, local game, or output files. Sanitize logs
and paths so they do not disclose credentials or unrelated personal information.

All commits and pull request titles must follow Conventional Commits. Supported types are
`feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`, and
`deps`; a scope is optional. Husky validates local commits, and CI validates every pull
request commit plus the title that becomes the squash commit.

Every non-release pull request must also add a new `.changeset/*.md` file. Run
`npm run changeset` for a public change and choose its `patch`, `minor`, or `major` impact.
For documentation, tests, CI, or other maintenance that needs no application version, run
`npm run changeset -- --empty`. The automated `changeset-release/main` Release PR is the only
exception because it consumes the pending files.

## Assets and Templates

Every new or replaced image, sound, template, or other asset needs documented asset provenance
and permission compatible with public redistribution. Include the original source,
author, license or permission, and any required attribution in the pull request. Do not add an
asset if its redistribution status is unclear.

For concerns about bundled templates or assets, contact `scampanhoni@gmail.com`.

## Versions and Releases

Changesets is the only owner of version planning and changelog entries. Contributors declare
release intent in their pull requests; they must not edit `package.json` versions,
`package-lock.json` versions, or `CHANGELOG.md` release sections manually.

After changes land on `main`, the Changesets Action maintains one Release PR. Its merge is the
human approval for the calculated SemVer version. A separate workflow verifies that exact
bump, builds the supported Windows ZIP, creates `v<version>`, and attaches the ZIP and
SHA-256 to a draft release. Maintainers review and publish the draft manually. The workflow
does not publish this private package to npm.

The repository secret `CHANGESETS_TOKEN` must contain a fine-grained token with read/write
contents and pull-request access. Without it, the Action cannot maintain a Release PR whose
updates trigger all required checks.

Beta trains use Changesets prerelease mode and must enter or exit through a reviewed pull
request:

```powershell
npm run changeset:pre -- enter beta
npm run changeset:pre -- exit
```

Contributors must not create tags, releases, or prerelease state from feature branches.
