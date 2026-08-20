# VSRG Skin Converter

VSRG Skin Converter is a TypeScript CLI for translating vertical-scrolling rhythm-game
skins. It supports Etterna to osu!mania and a 4K-only osu!mania to Etterna route.

The converter either analyzes an Etterna `NoteSkin.lua` and publishes an osu! skin, or reads
an osu! `skin.ini` and publishes an Etterna NoteSkin together with a new local profile. The
two directions use independent readers, conversions, target writers, and publication flows.

## Windows x64 Portable Release

End users do not need Node.js or npm. Download the versioned Windows x64 ZIP, verify its
adjacent `.sha256` file, extract the whole top-level directory, and run
`vsrg-skin-converter.cmd`. The launcher accepts `--help` and `--version`; without arguments it
starts the existing interactive converter. Keep `runtime`, `node_modules`, and `templates`
beside the launcher.

The portable ZIP contains the bundled ESM application, Node.js 22.23.2, the minimum Sharp
Windows x64 dependency closure, external osu!/Etterna templates, the project license, and
third-party notices. It is not an installer, is not code-signed, does not update itself, and
does not support Windows ARM64, Linux, or macOS. Node SEA remains an isolated, unmerged
experiment and is not a supported release format.

## License and Template Assets

The converter is licensed under the GNU General Public License v3.0 only
(`GPL-3.0-only`). The bundled templates are distributed with permission. If you have any
complaint or concern about the licensing, attribution, or ownership of a template or asset,
contact scampanhoni@gmail.com.

Release binaries and their corresponding source are published at
https://github.com/Stefany-Campanhoni/vsrg-skin-converter.

```text
vsrg-skin-converter-v<version>-win-x64/
|-- vsrg-skin-converter.cmd
|-- app.mjs
|-- runtime/node.exe
|-- node_modules/
|-- templates/{osu,etterna}/
|-- README.txt
|-- LICENSE
`-- THIRD-PARTY-NOTICES.txt
```

## Development Requirements

- Node.js 22.18 or newer
- Windows, for the native installation-folder picker
- Etterna and osu! installations, either at their defaults or selected interactively

Install dependencies:

```sh
npm install
```

The maintained release commands are:

```sh
npm run build
npm run build:windows
npm run test:distribution
npm run release:windows
```

`build` creates `build/app.mjs`. `build:windows` assembles the unpacked package under
`build/windows-portable`. `test:distribution` runs the distribution tests and publishes a
ZIP only after independent extraction and full verification. `release:windows` runs every
quality gate, rebuilds the package, and transactionally writes the ZIP and checksum under
`release`. These generated roots and `.cache/release` are ignored.

The pinned Node archive metadata lives in `scripts/release/release-config.ts`. To update it,
select a supported Node 22 LTS Windows x64 patch, replace the exact version, archive name,
official URL, and SHA-256 together, regenerate and inspect the runtime package lock when
needed, then run the complete release gate. Never accept an unverified cached download.

## Usage

Run the interactive CLI:

```sh
npm start
```

For development with automatic restart:

```sh
npm run dev
```

The CLI first asks for the source game. Missing default installations are recovered through
the same keypress and native folder-picker flow in either direction; cancelling a picker or
selection ends the operation without publishing.

For Etterna sources, the CLI checks `C:/Games/Etterna`, discovers local profiles under
`Save/LocalProfiles`, and discovers skins under `NoteSkins/dance`. The active theme comes
from `Save/Preferences.ini`, so playfield and judgement settings use the selected profile
and theme. The selected profile also supplies its positive integer CMod from the `<dance>`
modifier below `<DefaultModifiers>` in `Etterna.xml`.

Before publication, the CLI checks the default osu! installation at
`%LOCALAPPDATA%/osu!` and offers the same folder-picker recovery when unavailable. The
complete skin is written to `<resolved osu! installation>/Skins/<skin name>`. The target CFG
is not prompted for: the installer derives `osu!.<current Windows username>.cfg` directly
below the resolved osu! root, case-insensitively. If that file does not exist, start osu! at
least once so it creates the current user's CFG, then retry. The generated skin and updated
CFG are staged and published atomically. A failed run restores both previous targets and
preserves every other installed skin; unrelated CFG properties are retained.

For osu! sources, the CLI discovers `osu!.*.cfg` files in the installation root. A single
configuration is automatic; multiple configurations are selected by their `Username`.
The selected source CFG supplies its positive integer `ManiaSpeed`; this existing selection
is separate from the current-Windows-user target lookup used in the opposite direction.
`Fullscreen` chooses either `WidthFullscreen`/`HeightFullscreen` or `Width`/`Height`.
Resolutions wider than `1280` or taller than `720` use implicit `@2x` assets; exactly
`1280x720` is standard density. An explicit `@2x` reference always uses that file, and the
resolver never falls back between densities. Only PNG assets are supported.

The selected skin must have exactly one 4K `[Mania]` section. Its `UpsideDown: 1` value
means downscroll and omits Etterna's `Reverse` modifier; `UpsideDown: 0` or an absent value
means upscroll and emits `Reverse`. Any other present value is invalid.

The reverse route reads exactly one 4K `[Mania]` section and installs:

- `<Etterna>/NoteSkins/dance/<General Name>` with four normal receptors, four pressed
  receptors, four tap notes, and the static Etterna NoteSkin template;
- the next eight-digit directory below `<Etterna>/Save/LocalProfiles`, containing a new
  profile named after the selected osu! `Username` and settings below
  `<active-theme>_settings/playerConfig.lua`;
- a generated judgement sheet below `<Etterna>/Assets/Judgments` and its profile-GUID
  mapping in `<Etterna>/Save/<active-theme>_settings/assetsConfig.lua`.

If the NoteSkin already exists, the CLI asks for explicit overwrite confirmation before
allocating or publishing a profile. The NoteSkin, profile, judgement sheet, and asset
configuration are staged together and published atomically; a failure restores every
previous target and removes incomplete new output.

The reverse route migrates the six judgement images, but not judgement/combo zoom, fonts,
or long-note assets. Those remaining values and assets stay owned by the Etterna template.

The osu! template supplies fixed long-note assets. `LNB.png` is copied byte-for-byte to
`mania/lns/body.png`, and `LNT.png` is copied byte-for-byte to `mania/lns/tail.png`.
Internal build assets are removed from the generated skin after all output tasks succeed.

The template also supplies the global osu! interface assets required by the generated skin.
Score glyphs keep the `score` prefix and are copied unchanged. Combo glyphs use the separate
`combo` prefix and are resized by the converter so Etterna's combo zoom does not alter score
or ranking text.

The Etterna reader resolves the selected profile's GUID from `Etterna.xml` and its judgement
from `Save/<theme>_settings/assetsConfig.lua`. It accepts `1x6` and `2x6` sheets, uses the
left/Early column, and maps W1 through Miss to
`marvelous`, `perfect`, `great`, `good`, `bad`, and `miss`.

Every grade is written as both SD and `@2x`. `(Doubleres)` sources preserve the
original as `@2x` and generate SD at 50%; standard sources preserve the original
as SD and generate `@2x` at 200%.

Installation defaults and osu! output-path resolution are defined in `src/config`. Template
paths derive from the module-relative application root: source execution finds
`src/templates`, while `app.mjs` finds the copied release `templates`, regardless of the
current working directory.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
```

## Architecture

The project separates format adapters, game-neutral domain data, source-target conversions,
technical infrastructure, and command-line composition:

```text
src/
  adapters/
    etterna/
    osu/
  application/
  cli/
  config/
  conversions/
  domain/
  infrastructure/
  templates/
    etterna/
    osu/
tests/
  architecture/
  distribution/
  integration/
scripts/
  release/
distribution/
```

See [Architecture](docs/architecture.md) for the data flow and dependency boundaries, and
[Development Standards](docs/development-standards.md) for mandatory placement, naming,
testing, error-handling, and safety rules. Use the
[Agent Prompt Guidelines](docs/agent-prompt-guidelines.md) to specify and review future
agent-authored iterations consistently.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull
request. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), never in
a public issue.

## Current Coordinate Mapping

Etterna hit position `0` maps to osu!mania hit position `439`. Each Etterna point changes
the osu! value by one point. The osu! integer value is rounded because `skin.ini` does not
support fractional hit positions: `HitPosition = round(438 + NoteFieldY) + 1`.

Etterna `ComboY` and `JudgmentY` are read from
`GameplayXYCoordinates["4K"]`. The Etterna neutral value `0` maps to osu!
`ComboPosition 229` and `ScorePosition 240`, with one-to-one offsets:
`ComboPosition = round(230 + ComboY) - 1` and
`ScorePosition = round(240 + JudgmentY)`.

Etterna `ComboZoom` and `JudgmentZoom` are required numeric fields read from
`GameplaySizes["4K"]`. Combo images use `ComboZoom` directly, while judgement images use
`1 + (JudgmentZoom - 1) * 0.5`; for example, `0.6` produces 60% combo images and `0.35`
produces 67.5% judgement images. Both dimensions are rounded and clamped to at least one
pixel. The osu! writer applies these scales to the generated judgement variants and to the
copied `combo-0.png` through `combo-9.png`, `combo-comma.png`, and `combo-dot.png` assets,
including every `@2x` variant. This is an image-only conversion because osu!mania has no
equivalent size setting in `skin.ini`.

The receptor canvas changes linearly with the converted hit position: each one osu! hit
position point removed adds two pixels of height, and the inverse change reduces the canvas.
The renderer preserves a transparent footer calculated from the logical `480`-pixel
playfield, converted hit position, output canvas width, column width, and a named osu!
alignment calibration. This keeps the visible receptor bottom at the calibrated position
above the hit-position line after osu! scales the key image.

Etterna `ReceptorSize` is read from the active profile's `playerConfig.lua`. It maps to osu!
with `ColumnWidth = round(ReceptorSize - 38)`, so the Etterna default `100` becomes osu!
`62`.

Scroll speed conversion uses receptor size before serializing a positive integer target
value. For osu!mania to Etterna, the converter first derives the target `ReceptorSize`, then
applies:

```text
inaccurateFix = ReceptorSize > 100
receptorScale = ReceptorSize / 100
CMod = (435.59 * ManiaSpeed) / 13.72
if inaccurateFix: CMod += 35
result = round(CMod / receptorScale)
```

For Etterna to osu!mania, the selected profile's source `ReceptorSize` is used before column
width conversion:

```text
candidate = roundToTwoDecimals((435 * CMod) / 13720)
candidateCMod = osuToEtterna(candidate, ReceptorSize)
while candidateCMod < CMod:
    candidate += 1
    candidateCMod = osuToEtterna(candidate, ReceptorSize)
result = round(candidate)
```

For example, selected-profile `C888` with `ReceptorSize = 108` produces candidate `29.16`
and writes the integer `ManiaSpeed = 29` to the current Windows user's CFG.

The visible receptor layer is stretched vertically according to column width while its width
remains unchanged. The empirical calibration maps osu! column width `46` to no stretch and
`62` to a vertical scale of `196 / 146`. Input-specific trailing transparency is removed
before the exact target footer is applied. The current visual alignment offset is `23`
logical pixels. Trial-and-error values remain isolated in
`src/adapters/osu/writer/osu-receptor-calibration.ts`, so calibration changes do not leak
into generic image processing.

Generated receptors use osu!'s `@2x` suffix, including pressed variants such as
`left_tap@2x.png`; the `skin.ini` template references the same names.

For osu! to Etterna, the inverse coordinate and width formulas are:

```text
NoteFieldY   = round(HitPosition) - 439
ComboY       = round(ComboPosition) - 229
JudgmentY    = round(ScorePosition) - 240
ReceptorSize = round(arithmeticMean(ColumnWidth) + 38)
```

Source density selects only the osu! receptor/note input asset; it does not change those
Etterna output names or dimensions. The four generated notes are `_Left Tap Note (res 64x64).png`, `_Down Tap Note
(res 64x64).png`, `_Up Tap Note (res 64x64).png`, and `_Right Tap Note (res 64x64).png`, each
resized to exactly 150x150 pixels.

The eight generated receptors use the same fixed ` (res 64x64)` decoration with `release`
and `pressed` prefixes. Each receptor is vertically trimmed to its visible rows, reshaped to
a square whose sides equal the source width, and then resized to exactly 146x146 pixels. A
fully transparent normal receptor remains transparent at the fixed output size. A fully
transparent pressed receptor uses the processed normal receptor for the same direction;
unreadable images remain fatal errors. Static template assets keep their template-defined
names, including any `(doubleres)` decoration outside generated `Notes` and `Receptors`.

The six osu! Mania judgement references are stacked without scaling in Etterna order:
`marvelous`, `perfect`, `great`, `good`, `bad`, `miss`. Unequal images are centered in
transparent cells sized to the maximum source width and height. A `Hit*` value can name a
PNG relative to the skin root or a directory containing the corresponding `mania-hit*`
default. Missing `Hit*` properties use those defaults from the skin root. When both an
unsuffixed PNG and its `-0` animation frame exist, `-0` takes precedence. All six inputs must
resolve to one density. Standard input produces `<skin> - <guid> 1x6.png`;
double-resolution input produces `<skin> - <guid> 1x6 (Doubleres).png`. The active theme's existing
`assetsConfig.lua` is preserved apart from the new `judgment[guid]` mapping, and a concurrent
change to that file aborts publication instead of overwriting it.
