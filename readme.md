# VSRG Skin Converter

[![Quality](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/ci.yml/badge.svg)](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/codeql.yml/badge.svg)](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/codeql.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

VSRG Skin Converter is a TypeScript CLI that migrates vertical-scrolling rhythm-game skins
between Etterna and osu!mania. It reads each game's native configuration and assets, converts
the supported values, and publishes a complete target skin without modifying the source.

> The project is currently in beta. The supported portable build targets Windows x64, and
> osu!mania to Etterna conversion currently supports 4K skins only.

## Supported conversions

| Source | Target | Current scope |
| --- | --- | --- |
| Etterna | osu!mania | Notes, receptors, judgements, positions, column width, combo assets, and template-provided long notes |
| osu!mania 4K | Etterna | Notes, normal and pressed receptors, judgements, positions, receptor size, NoteSkin, and a new local profile |

The osu!mania to Etterna route does not yet migrate long notes, fonts, or judgement/combo
zoom. Unsupported values remain owned by the Etterna template.

## Download and run

1. Open the [GitHub Releases](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/releases) page.
2. Download the Windows x64 ZIP and its adjacent `.sha256` file.
3. Verify the archive, extract the complete top-level directory, and run
   `vsrg-skin-converter.cmd`.

PowerShell can verify the archive with:

```powershell
Get-FileHash .\vsrg-skin-converter-v<version>-win-x64.zip -Algorithm SHA256
Get-Content .\vsrg-skin-converter-v<version>-win-x64.zip.sha256
```

The two hashes must match. Keep `app.mjs`, `runtime`, `node_modules`, and `templates` beside
the launcher. Node.js and npm are included in the portable package and do not need to be
installed separately.

The portable build is not an installer, is not currently code-signed, does not update
itself, and does not support Windows ARM64, Linux, or macOS.

## How it works

The interactive CLI asks for the source game, discovers installed profiles and skins, and
offers a native folder picker when a default installation cannot be found.

- Etterna skins are read from `NoteSkins/dance`. The converted osu! skin is installed under
  the selected osu! `Skins` directory.
- osu! skins are read from the selected user's configuration. The converted NoteSkin is
  installed under `Etterna/NoteSkins/dance`, and a new numbered local profile is created
  under `Etterna/Save/LocalProfiles`.

Existing target skins require explicit overwrite confirmation. Output is staged and promoted
transactionally, so a failed conversion preserves the previous target and removes incomplete
files.

## Run from source

Requirements:

- Node.js 22.18 or newer
- Windows for the native installation-folder picker
- Etterna and/or osu! installed, depending on the conversion direction

Install dependencies and start the CLI:

```powershell
npm install
npm start
```

Use `npm run dev` for automatic restart while developing.

## Development

The main quality gate is:

```powershell
npm run check
```

Maintained distribution commands are:

```powershell
npm run build
npm run build:windows
npm run test:distribution
npm run release:windows
```

Repository quality and release automation lives under `.ci`, grouped by responsibility.
The npm commands above are the supported interface for running release tooling locally.

Every pull request must use a Conventional Commit title and add a Changeset. Run
`npm run changeset` for a public `patch`, `minor`, or `major` change, or
`npm run changeset -- --empty` for maintenance that should not release the application.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Releases

Changesets maintains one version PR on `main`. Merging that PR is the human approval for the
calculated version. The following workflow verifies the version and changelog, runs the full
Windows release gate, creates `v<version>`, and uploads the ZIP and SHA-256 to a GitHub draft
release. In other words, it creates a draft release that a maintainer still reviews and
publishes manually. Prerelease versions are marked accordingly.

Maintainers must configure `CHANGESETS_TOKEN` as a fine-grained repository secret with
read/write access to contents and pull requests. The package is private to npm; the release
workflow does not run `npm publish`.

## Documentation

- [Architecture](docs/architecture.md) — conversion flow, ownership, dependencies, and
  transactional publication
- [Development standards](docs/development-standards.md) — placement, tests, errors, safety,
  and release rules
- [Agent prompt guidelines](docs/agent-prompt-guidelines.md) — requirements for future
  agent-authored changes and reviews
- [Security policy](SECURITY.md) — private vulnerability reporting

`AGENTS.md` is a lightweight entry point to these canonical documents.

## License and template assets

VSRG Skin Converter is licensed under the [GNU General Public License v3.0](LICENSE)
(`GPL-3.0-only`). Bundled templates are distributed with permission.

For concerns about the licensing, attribution, or ownership of a bundled template or asset,
contact [scampanhoni@gmail.com](mailto:scampanhoni@gmail.com).
