# osu! Receptor Hit-Position Alignment Design

## Goal

Keep the visible bottom edge of every converted Etterna receptor at one calibrated logical
offset above the osu! hit position for every column width, while preserving the approved
`196 / 146` vertical stretch at column width `62`.

## Root Cause

osu! mania key images are positioned from the bottom of the logical `480`-pixel gameplay
area and scaled to the configured column width. The receptor PNG therefore needs a
transparent footer representing the logical distance between `HitPosition` and the
playfield bottom.

The previous implementation removed trailing transparency and placed the visible receptor
at the physical bottom of the PNG. This anchored the receptor to the bottom of the gameplay
area instead of the hit-position line.

## Dynamic Footer

The renderer first removes source trailing transparency so input-specific padding cannot
affect the result. It then calculates the exact target footer:

```text
logicalBottomGap = logicalPlayfieldHeight - hitPosition
logicalBottomGap += logicalVerticalOffset
sourcePixelsPerLogicalPixel = canvasWidth / columnWidth
bottomPadding =
  round(logicalBottomGap * sourcePixelsPerLogicalPixel)
```

The osu! writer supplies:

```text
logicalPlayfieldHeight = 480
renderedWidth = columnWidth
logicalVerticalOffset = 13
```

The image infrastructure reads `canvasWidth` from `receptor-base.png` and applies:

```text
top = canvasHeight - bottomPadding - visibleReceptorHeight
```

The canvas height has a floor of:

```text
visibleReceptorHeight + bottomPadding
```

This guarantees a non-negative `top` and preserves the requested footer even for unusually
tall receptors.

For the current neutral conversion:

```text
hitPosition = 432
columnWidth = 62
canvasWidth = 150
logicalPlayfieldHeight = 480
visibleReceptorHeight = 196
canvasHeight = 368

bottomPadding = round((480 - 432) * 150 / 62) = 116
calibratedBottomPadding = round((480 - 432 + 13) * 150 / 62) = 148
top = 368 - 148 - 196 = 24
visibleBottom = 219
```

After osu! scales the `150`-pixel PNG width to the `62`-pixel column, the calibrated footer
becomes approximately `61` logical pixels. The visible receptor is therefore placed `13`
logical pixels above the hit-position line, matching the measured screenshot correction.

## Stretch Calibration

The approved calibration remains unchanged:

```text
unstretchedColumnWidth = 46
calibratedColumnWidth = 62
calibratedVerticalScale = 196 / 146
logicalVerticalOffset = 13
```

Column width may change the receptor height, but the dynamic footer compensates for osu!'s
corresponding image scale so the visible bottom remains at the same calibrated position
relative to the hit-position line.

All four empirical values live in one named `receptorCalibration` object. The writer reads
the logical offset through a focused calibration function. Neither `13` nor the stretch
reference values appear inline in orchestration or image-processing code.

## Responsibility Boundaries

- The osu! receptor-calibration module owns the named `logicalVerticalOffset = 13` and
  vertical stretch reference points.
- The osu! writer owns the named `logicalPlayfieldHeight = 480`, the converted column
  width, and the existing named two-pixel canvas factor.
- The image infrastructure receives generic `logicalCanvasHeight` and `renderedWidth`
  options plus a generic `logicalBottomOffset`. It uses the base image width to convert the
  adjusted logical bottom gap into source pixels.
- Etterna parsing, neutral models, template rendering, receptor discovery, output names,
  and note conversion remain unchanged.

No osu!-specific constant is embedded in the Sharp infrastructure.

## Error Handling

The renderer rejects:

- unreadable source or base images;
- non-positive rendered widths;
- hit positions outside the logical canvas;
- rendered receptors without visible pixels;
- invalid canvas calculations.

The output canvas is never smaller than the visible receptor plus its calculated footer.

## Testing

The change follows test-driven development:

1. Add unit tests for dynamic footer conversion at `432/62/150/13 -> 148` and other widths.
2. Change pixel tests to require `top: 24`, `bottom: 219`, and a `148`-pixel footer for the
   neutral conversion.
3. Prove different column widths keep the visible bottom at the same calibrated logical
   position after applying each output scale.
4. Preserve coverage for trailing-transparency removal, horizontal margins, rotations,
   spritesheet frames, and fully transparent input.
5. Update the Etterna-to-osu! integration expectation.
6. Run formatting, lint, all tests, typecheck, architecture checks, and `git diff --check`.

## Preserved Behavior

- `ReceptorSize 100` maps to osu! `ColumnWidth 62`.
- Column width `62` uses vertical scale `196 / 146`.
- The named logical alignment calibration is `13`.
- The receptor canvas changes by two pixels per converted hit-position point.
- Receptor filenames retain the `@2x` suffix.
- Receptors are proportionally normalized without enlargement before vertical stretching.
- Note rendering and conversion routes outside Etterna-to-osu! are unaffected.
