# Etterna-to-osu! Column Width and Receptor Stretch Design

## Goal

Read Etterna's `ReceptorSize` from `playerConfig.lua`, convert it to osu!'s `ColumnWidth`,
render the converted width into `skin.ini`, and vertically stretch the visible receptor
layer according to an easily adjustable empirical calibration.

## Source Configuration

The Etterna adapter finds `playerConfig.lua` case-insensitively under the selected local
profile's `Rebirth_settings` directory. File selection is explicit and deterministic; it
does not depend on whichever file the filesystem returns first.

The returned Lua table contains:

- `GameplayXYCoordinates["4K"]`, which provides the existing gameplay positions;
- top-level `ReceptorSize`, which provides the source column width.

`ReceptorSize` is required and must be numeric. The skin read fails with a contextual error
when the file or property cannot be resolved. Etterna Lua remains statically parsed and is
never executed.

## Neutral Model

`PlayfieldConfiguration` gains a required numeric `columnWidth`. An Etterna reader stores
the source `ReceptorSize` in this field. A conversion replaces it with the target game's
equivalent value. The field expresses a neutral playfield concept while its numeric unit
belongs to the model's current `game`.

## Column Width Conversion

The Etterna-to-osu! conversion owns the cross-format equivalence:

```text
osuColumnWidth = round(etternaReceptorSize - 38)
```

Reference values:

- Etterna `100` maps to osu! `62`;
- Etterna `101` maps to osu! `63`;
- Etterna `106` maps to osu! `68`;
- Etterna `100.5` maps to osu! `63`.

The constants that establish `100 -> 62` live in a focused
`conversions/etterna-to-osu` module rather than in either game adapter.

## osu! Template Rendering

The osu! writer supplies the converted column width to the template. The four lanes use the
same value:

```ini
ColumnWidth: ${column_width},${column_width},${column_width},${column_width}
```

Existing wildcard behavior remains unchanged: unknown wildcards are preserved. A complete
osu! model always supplies `column_width`.

## Receptor Calibration

Column width changes the vertical scale of the visible receptor layer, not the transparent
canvas formula. The empirical calibration is:

```text
unstretchedColumnWidth = 46
calibratedColumnWidth = 62
calibratedVerticalScale = 211 / 146

slope =
  (calibratedVerticalScale - 1) /
  (calibratedColumnWidth - unstretchedColumnWidth)

verticalScale =
  1 + (columnWidth - unstretchedColumnWidth) * slope
```

Reference results:

- osu! column width `46` produces scale `1`;
- osu! column width `62` produces scale `211 / 146`, matching the supplied manual image;
- osu! column width `68` produces scale approximately `1.6122`.

The three calibration points are colocated in a focused osu! receptor-calibration module and
named explicitly so trial-and-error recalibration requires changing only those values.

The calibration rejects a computed scale less than or equal to zero.

## Image Pipeline

Receptor rendering proceeds in this order:

1. extract the selected spritesheet frame;
2. rotate it according to the resolved Etterna direction;
3. apply the existing proportional maximum-size normalization;
4. resize the complete visible receptor layer vertically by the supplied scale while
   preserving its width;
5. calculate the transparent canvas from the hit position;
6. ensure the canvas is never shorter than the stretched layer;
7. center the stretched layer horizontally and anchor it at the top.

The Sharp infrastructure consumes a generic `verticalScale` and does not know column-width
semantics or calibration points.

The canvas hit-position factor remains `3` pixels per point, preserving the user's current
IDE correction. The `@2x` receptor filenames and tap-note behavior remain unchanged.

## Responsibility Boundaries

- Etterna adapter: discover and statically read `playerConfig.lua`.
- Neutral domain: carry `columnWidth` as playfield data.
- Etterna-to-osu! conversion: convert `ReceptorSize` units to osu! `ColumnWidth`.
- osu! adapter: own empirical receptor scale calibration, render the template, and request
  target image processing.
- Image infrastructure: apply a supplied vertical scale and compose pixels.

No Etterna-specific property name enters the domain, osu! adapter, or image infrastructure.

## Testing

Tests cover:

- case-insensitive deterministic `playerConfig.lua` discovery;
- required numeric `ReceptorSize` parsing;
- `100 -> 62`, `101 -> 63`, `106 -> 68`, and fractional rounding;
- propagation of `columnWidth` through reader, conversion, and writer;
- four equal `ColumnWidth` template entries;
- calibration at column widths `46`, `62`, and `68`;
- rejection of a non-positive calculated scale;
- visible width preservation, `146 -> 211` vertical scaling, and top anchoring;
- integration with Etterna `ReceptorSize 100`, osu! `ColumnWidth 62`, and stretched receptor
  output;
- preservation of the canvas hit-position factor `3`;
- complete tests, typecheck, lint, dependency rules, whitespace checks, and real-skin image
  audit.
