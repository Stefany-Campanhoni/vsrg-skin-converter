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

The CLI discovers Etterna skins under `NoteSkins/dance`, asks which skin to convert, and
writes the complete osu! skin to `output_folder`. A successful run fully replaces the
previous output. A failed run preserves it.

The osu! template supplies fixed long-note assets. `LNB.png` is copied byte-for-byte to
`mania/lns/body.png`, and `LNT.png` is copied byte-for-byte to `mania/lns/tail.png`.
Internal build assets are removed from the generated skin after all output tasks succeed.

The default installation and output paths are defined in `src/config`.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run test:architecture
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
testing, error-handling, and safety rules.

## Current Coordinate Mapping

Etterna hit position `0` maps to osu!mania hit position `438`. Each Etterna point changes
the osu! value by one point. The osu! integer value is rounded because `skin.ini` does not
support fractional hit positions.

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
