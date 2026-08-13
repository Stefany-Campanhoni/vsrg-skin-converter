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

The project follows Conventional Commit-style titles such as `feat:`, `fix:`, `docs:`,
`test:`, `refactor:`, `build:`, and `chore:`. Maintainers may squash a pull request, so its
title must describe the resulting commit accurately.

## Assets and Templates

Every new or replaced image, sound, template, or other asset needs documented asset provenance
and permission compatible with public redistribution. Include the original source,
author, license or permission, and any required attribution in the pull request. Do not add an
asset if its redistribution status is unclear.

For concerns about bundled templates or assets, contact `scampanhoni@gmail.com`.

## Versions and Releases

The committed `package.json` version is the single application-version source. Use SemVer and
prereleases such as `0.1.0-beta.2`; Git tags add the `v` prefix. Contributors must not create
tags or publish releases from feature branches. Release preparation and publication are
maintainer responsibilities after all required checks pass.
