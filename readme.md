# VSRG Skin Converter

VSRG Skin Converter is a TypeScript CLI for translating vertical-scrolling rhythm-game
skins. The currently supported route is Etterna to osu!mania.

The converter statically analyzes Etterna `NoteSkin.lua` files, resolves receptors and tap
notes, converts gameplay coordinates, renders the osu! assets described by the template, and
publishes a complete `output_folder`.

## Requirements

- Node.js 22.18 or newer
- An Etterna installation at the configured location

Install dependencies:

```sh
npm install
```

## Usage

Run the interactive CLI:

```sh
npm start
```

For development with automatic restart:

```sh
npm run dev
```

The CLI discovers local Etterna profiles under `Save/LocalProfiles`, automatically uses the
only profile or asks when multiple profiles exist, then discovers skins under
`NoteSkins/dance`. It resolves the active Etterna theme from `Save/Preferences.ini` so
playfield and judgement settings come from the selected profile and theme. The complete
osu! skin is written to `output_folder`; a successful run fully replaces the previous
output, while a failed run preserves it.

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

The default installation and output paths are defined in `src/config`.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run test:architecture
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
tests/
  architecture/
  integration/
```

See [Architecture](docs/architecture.md) for the data flow and dependency boundaries, and
[Development Standards](docs/development-standards.md) for mandatory placement, naming,
testing, error-handling, and safety rules. Use the
[Agent Prompt Guidelines](docs/agent-prompt-guidelines.md) to specify and review future
agent-authored iterations consistently.

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

The visible receptor layer is stretched vertically according to column width while its width
remains unchanged. The empirical calibration maps osu! column width `46` to no stretch and
`62` to a vertical scale of `196 / 146`. Input-specific trailing transparency is removed
before the exact target footer is applied. The current visual alignment offset is `23`
logical pixels. Trial-and-error values remain isolated in
`src/adapters/osu/writer/osu-receptor-calibration.ts`, so calibration changes do not leak
into generic image processing.

Generated receptors use osu!'s `@2x` suffix, including pressed variants such as
`left_tap@2x.png`; the `skin.ini` template references the same names.
