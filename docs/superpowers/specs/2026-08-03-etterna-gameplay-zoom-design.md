# Etterna gameplay zoom conversion

## Goal

Preserve the Etterna profile's `JudgmentZoom` and `ComboZoom` settings in
Etterna-to-osu!mania conversion by resizing the corresponding output images.

## Source data

`readEtternaProfile` statically parses `playerConfig.lua`. In addition to the
existing `GameplayXYCoordinates["4K"]` positions and root `ReceptorSize`, it
will read these required numeric fields from `GameplaySizes["4K"]`:

- `JudgmentZoom`
- `ComboZoom`

The Etterna reader converts the two source settings into neutral proportional
scale factors carried by `PlayfieldConfiguration`: `comboScale` and
`judgementScale`. The Etterna-to-osu! conversion retains those factors while
converting the existing positions and column width.

## Scaling rules

Both dimensions of each image are scaled proportionally, using rounded pixel
dimensions with a minimum of one pixel.

- Combo images use `ComboZoom` directly. Every `0.1` represents ten percentage
  points of the original asset size: `0.6` becomes 60% and `1` remains 100%.
- Judgement images use `1 + (JudgmentZoom - 1) * 0.75`. Every `0.1` differs by
  7.5 percentage points from the original asset size: `0.35` becomes 51.25% and
  `1` remains 100%.

## Output behavior

The osu! writer applies the normalized judgement scale when it renders each
selected Etterna judgement sheet into its SD and `@2x` variants. It applies the
normalized combo scale after template copying to `score-0.png` through
`score-9.png` and their `@2x` counterparts. The `skin.ini` remains unchanged
because osu!mania has no equivalent size setting.

## Failure behavior

Malformed, missing, or non-numeric zoom settings fail profile parsing with the
same explicit numeric-field error convention used by the existing required
profile settings. Resizing cannot produce a zero-sized image.

## Tests

Tests will prove that profile parsing reads both values from the 4K size table,
the conversion retains them, and rendering produces scaled SD and HD judgement
and combo assets while preserving the existing 1x behavior.
