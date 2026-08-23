# 🎹 VSRG Skin Converter

<p align="center"><em>A tiny wardrobe wizard for your rhythm-game skins. 🪄✨</em></p>

<p align="center">
  <a href="https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/ci.yml">
    <img alt="Quality" src="https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/ci.yml/badge.svg">
  </a>
  <a href="https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/codeql.yml">
    <img alt="CodeQL" src="https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/codeql.yml/badge.svg">
  </a>
  <a href="LICENSE">
    <img alt="License: GPL v3" src="https://img.shields.io/badge/License-GPLv3-blue.svg">
  </a>
  <a href="https://buymeacoffee.com/tefyyay">
    <img alt="Buy Me a Coffee" src="https://img.shields.io/badge/Buy_Me_a_Coffee-support_tefyyay-FFDD00?logo=buy-me-a-coffee&amp;logoColor=000000">
  </a>
</p>

VSRG Skin Converter is a TypeScript CLI that migrates vertical-scrolling rhythm-game skins
between Etterna and osu!mania. It reads each game's native configuration and assets, converts
the supported values, and publishes a complete target skin without modifying the source.

> The project is currently in beta. The supported portable build targets Windows x64, and
> osu!mania to Etterna conversion currently supports 4K skins only.

## Table of contents

- 🎮 [Supported conversions](#supported-conversions)
- 📦 [Download and run](#download-and-run)
- 🪄 [How it works](#how-it-works)
  - [Scroll speed and direction](#scroll-speed-and-direction)
  - [Combo zoom](#combo-zoom)
- 🧑‍💻 [Run from source](#run-from-source)
- 🧰 [Development](#development)
- 🚀 [Releases](#releases)
- 📚 [Documentation](#documentation)
- 📜 [License and template assets](#license-and-template-assets)

## Supported conversions

| Source | Target | Current scope |
| --- | --- | --- |
| Etterna | osu!mania | Notes, receptors, judgements, positions, column width, CMod to scroll speed, combo assets, and template-provided long notes |
| osu!mania 4K | Etterna | Notes, normal and pressed receptors, judgements, positions, receptor size, scroll speed and direction, relative combo zoom, NoteSkin, and a new local profile |

The osu!mania to Etterna route does not yet migrate long notes, font artwork, or judgement
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

- Etterna skins are read from `NoteSkins/dance`. The selected local profile supplies its
  positive integer CMod from `Etterna.xml`. The converted osu! skin is installed under the
  selected osu! `Skins` directory, and the target `ManiaSpeed` is written to the current
  Windows user's `osu!.<username>.cfg`.
- osu! skins use a source CFG selected by `Username`; that CFG supplies `ManiaSpeed`. The
  unique 4K `[Mania]` section supplies `UpsideDown`. The converted NoteSkin is installed
  under `Etterna/NoteSkins/dance`, and a new numbered local profile is created under
  `Etterna/Save/LocalProfiles`.

For an osu! source, `[General].Name` supplies the converted skin name when present and
non-empty. Otherwise, the converter uses the immediate source skin directory name, allowing
skins with a missing or misspelled name property to remain selectable and convertible.

The Etterna-to-osu! route never prompts for a target CFG. It resolves the current Windows
user's CFG case-insensitively below the osu! root. If the file is missing, start osu! at
least once so the game creates it, then retry.

Existing target skins require explicit overwrite confirmation. Output is staged and promoted
transactionally. Etterna-to-osu! publishes the skin and guarded CFG rewrite as one output
set; osu!mania-to-Etterna publishes its NoteSkin, profile, judgement, and profile settings
together. A failed conversion restores previous targets and removes incomplete output.

### Scroll speed and direction

osu!mania to Etterna first converts column width to `ReceptorSize`, then converts the selected
source CFG's `ManiaSpeed` to an integer CMod:

```text
inaccurateFix = ReceptorSize > 100
receptorScale = ReceptorSize / 100
CMod = (435.59 * ManiaSpeed) / 13.72
if inaccurateFix: CMod += 35
result = round(CMod / receptorScale)
```

For Etterna to osu!mania, conversion uses the selected profile's source `ReceptorSize` before
column-width conversion:

```text
candidate = roundToTwoDecimals((435 * CMod) / 13720)
candidateCMod = osuToEtterna(candidate, ReceptorSize)
while candidateCMod < CMod:
    candidate += 1
    candidateCMod = osuToEtterna(candidate, ReceptorSize)
result = round(candidate)
```

For example, selected-profile `C888` with `ReceptorSize = 108` starts at `28.15`, reaches
`29.15` after one increment, and writes integer `ManiaSpeed = 29`.

For direction, `UpsideDown: 1` means downscroll and omits Etterna's `Reverse` modifier.
`UpsideDown: 0` or an absent property means upscroll and emits `Reverse`. Other present values
are invalid. Etterna scroll direction is not migrated back to osu!mania.

### Combo zoom

The osu! reader resolves `[Fonts].ComboPrefix` digits `0` through `9` at the selected asset
density. A 42-pixel SD or 84-pixel `@2x` digit height maps to Etterna `ComboZoom = 1`; the
converter uses the median height ratio and tolerates one selected-density pixel of variation.
An incomplete combo font falls back silently to `ComboZoom = 1`, while unsafe paths,
unreadable images, and inconsistent heights remain fatal.

When a 4K `[Mania]` section omits or leaves empty its note or receptor image references, the
osu! reader uses the standard lane defaults. Columns 1 and 4 use `mania-note1`, `mania-key1`,
and `mania-key1D`; columns 2 and 3 use their `mania-note2`, `mania-key2`, and `mania-key2D`
counterparts. The selected asset density still applies, and conversion fails when a required
default PNG is absent.

Missing osu!mania judgement images use the bundled osu!mania default when converting to
Etterna. Each missing grade is extracted from the default 1x6 sheet and mixed with the custom
grades that exist. For an `@2x` source configuration, default frames are doubled before the
complete Etterna sheet is composed.

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
- [Security policy](SECURITY.md) — private vulnerability reporting

`AGENTS.md` is the entry point and working agreement for agent-authored changes.

## License and template assets

VSRG Skin Converter is licensed under the [GNU General Public License v3.0](LICENSE)
(`GPL-3.0-only`). Bundled templates are distributed with permission.

The bundled osu!mania default judgement sheet is derived from the osu! legacy skin assets
by ppy Pty Ltd, distributed under [CC BY-NC 4.0](https://github.com/ppy/osu-resources/blob/master/LICENCE.md).

For concerns about the licensing, attribution, or ownership of a bundled template or asset,
contact [scampanhoni@gmail.com](mailto:scampanhoni@gmail.com).
