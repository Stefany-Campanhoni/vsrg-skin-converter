<p align="center">
  <img alt="VSRG Skin Converter banner" src="docs/assets/banner.png" width="100%">
</p>

# 🎹 VSRG Skin Converter

<p align="center">
  <em>Convert vertical-scrolling rhythm-game skins between Etterna and osu!mania.</em>
</p>

<p align="center">
  <a href="https://github.com/Stefany-Campanhoni/vsrg-skin-converter/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/Stefany-Campanhoni/vsrg-skin-converter?display_name=tag&amp;sort=semver&amp;style=flat-square">
  </a>
  <a href="https://github.com/Stefany-Campanhoni/vsrg-skin-converter/actions/workflows/ci.yml">
    <img alt="Windows quality" src="https://img.shields.io/github/actions/workflow/status/Stefany-Campanhoni/vsrg-skin-converter/ci.yml?branch=main&amp;label=quality&amp;style=flat-square">
  </a>
  <a href="LICENSE">
    <img alt="License: GPL v3" src="https://img.shields.io/badge/license-GPLv3-blue?style=flat-square">
  </a>
</p>

VSRG Skin Converter is a small interactive CLI that migrates supported settings and artwork
between Etterna and osu!mania. It leaves the source skin untouched and publishes the complete
target as one recoverable operation.

If the converter saves you time, you can help fund maintenance and support for more formats
through [Buy Me a Coffee](https://buymeacoffee.com/tefyyay).

<p align="center">
  <a href="https://buymeacoffee.com/tefyyay">
    <img alt="Support the project on Buy Me a Coffee" height="50" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png">
  </a>
</p>

> The supported portable build targets Windows x64, and currently supports 4K skins only.

## Table of contents

- [Download and run](#download-and-run)
- [How to use it](#how-to-use-it)
- [Run from source](#run-from-source)
- [License and template assets](#license-and-template-assets)

## Download and run

1. Open the [latest GitHub release](https://github.com/Stefany-Campanhoni/vsrg-skin-converter/releases/latest).
2. Download the Windows x64 ZIP and its adjacent `.sha256` file.
3. Verify that the archive hash matches the checksum file.
4. Extract the complete top-level directory.
5. Run `vsrg-skin-converter.cmd`.

You can verify the download in PowerShell:

```powershell
Get-FileHash .\vsrg-skin-converter-v<version>-win-x64.zip -Algorithm SHA256
Get-Content .\vsrg-skin-converter-v<version>-win-x64.zip.sha256
```

The two hashes must match. Keep `app.mjs`, `runtime`, `node_modules`, and `templates` beside
the launcher. The portable package already includes Bun 1.4.0 and the required runtime
dependencies.

The portable build is not an installer, is not currently code-signed, and does not update
itself. Windows ARM64, Linux, and macOS are not supported.

## How to use it

1. Start `vsrg-skin-converter.cmd`.
2. Choose the source game.
3. Select the source profile, configuration, and skin when prompted.
4. Choose an installation folder if the default installation is not found.
5. Review the exact target and confirm before replacing an existing skin.
6. Wait for the success message, then open the target game.

For **Etterna to osu!mania**, the converter reads the selected Etterna NoteSkin and local
profile, installs the converted skin under osu!'s `Skins` directory, and updates the current
Windows user's `ManiaSpeed`. Start osu! at least once before converting so that its user
configuration exists.

For **osu!mania to Etterna**, the converter reads the selected osu! skin and user
configuration, installs a new Etterna NoteSkin, and creates a numbered local profile with the
converted settings.

The converter stages its output before changing any target. If conversion or installation
fails, it restores the previous files and removes incomplete output.

## Run from source

### Browser converter

The static GitHub Pages app converts entirely on your computer, with no upload or backend.
For Etterna → osu!mania, select the Etterna installation, then a dance NoteSkin and a local
profile. For osu!mania → Etterna, select only the skin folder and choose SD or HD explicitly.
Only 4K is supported. Review the target visual settings, download the ZIP, and follow its
`INSTALLATION.md` before applying anything to a game installation.

The interface starts in English with a dark theme. Use the top controls for Portuguese or
the light theme; these changes retain the selected source and completed ZIP. Switching
conversion routes slides the purple arrow and pink triangle backgrounds linearly and clears
the source for the new game. The whole interface palette smoothly exchanges purple for pink,
retaining the same border shapes and opacity. While the worker
discovers skins, inspects files or converts images, the folder controls are replaced by a
processing panel showing the current stage. Reduced-motion preferences disable displacement
and pulsing while retaining a gentle exchange of gradient and interface colors. Technical
converter diagnostics retain their original English messages in the conversion notes.

Absent Etterna profile settings use browser defaults with warnings. Present invalid files
remain errors. A valid source CMod produces a manual ManiaSpeed instruction. The reverse
browser route never reads an osu! CFG or produces CMod/profile XML; configure speed with
[CMod Calculator](https://cmodcalc.com/). The CLI retains its full speed/profile migration.

Use a modern browser over HTTPS (or localhost). The app enables isolation through a local
service worker and may reload once **before** enabling folder selection. Directory handles
are read-only; a directory file input is available as a fallback. Prefer the native folder
picker for large installations: the file-list picker may take time to enumerate the entire
folder before handing files to the app. Discovery and file-list indexing then run in the
worker, with indexed directory lookups avoiding repeated scans of unrelated Songs.
Selection and diagnostics
are never persisted. Limits: 32 MiB per source/image, 16 megapixels per decoded image, and
256 MiB generated files. Installation is manual and the ZIP includes backup instructions.

```powershell
bun ci
bun run dev:web
# Open http://localhost:4173/vsrg-skin-converter/
bun run build:web
$env:PLAYWRIGHT_CHANNEL = "msedge"
bun run test:browser
```

The build emits `build/web`. The Browser Pages workflow verifies PRs and deploys only `main`
to the `github-pages` environment. Enable **Settings → Pages → Source → GitHub Actions**
before the first deployment. No deployment URL is claimed until that workflow succeeds.

### Native CLI

Requirements:

- Windows 10 or newer
- Bun 1.4.0
- Etterna and osu!, depending on the conversion direction

Install the exact dependency tree and start the CLI:

```powershell
bun ci
bun run start
```

Use `bun run dev` to restart automatically while editing. Add `--verbose` to include the
complete error stack:

```powershell
bun run start --verbose
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development, testing, Changesets, and pull request
requirements.

## License and template assets

VSRG Skin Converter is licensed under the [GNU General Public License v3.0](LICENSE)
(`GPL-3.0-only`). Bundled templates are distributed with permission.

The browser's decorative arrow and triangle patterns are original SVG drawings authored
for this project and distributed under its GPL-3.0-only license. The arrow direction was
inspired by a user-provided Etterna reference; that raster image and its wordmark are not
included in the browser distribution.

The project banner was created for VSRG Skin Converter by
[@akaneyt](https://www.youtube.com/@akaneyt) and is redistributed with the artist's permission.

The bundled osu!mania default judgement sheet is derived from the osu! legacy skin assets by
ppy Pty Ltd and distributed under
[CC BY-NC 4.0](https://github.com/ppy/osu-resources/blob/master/LICENCE.md).

For concerns about the licensing, attribution, or ownership of a bundled template or asset,
contact [scampanhoni@gmail.com](mailto:scampanhoni@gmail.com).
