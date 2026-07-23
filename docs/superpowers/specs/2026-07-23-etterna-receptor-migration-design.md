# Etterna Receptor Migration Design

## Goal

Discover the normal and pressed receptor visuals used by an Etterna noteskin and generate the
eight PNG files referenced by the osu! `skin.ini` template.

This design covers only Etterna-to-osu! conversion. Its boundaries remain directional so a future
osu!-to-Etterna conversion can add separate readers and writers without mixing format-specific
rules.

## Evidence from real noteskins

The investigation covered both supplied `NoteSkin.lua` examples and the noteskins under `tmp`.
The sample contains:

- 24 `NoteSkin.lua` files;
- 22 `*Receptor.lua` files;
- 3 `*Receptor.redir` files;
- 117 Lua files in total.

`luaparse` parsed all 117 Lua files successfully.

Four receptor patterns occur in the sample:

1. Separate normal and pressed textures, such as `release`/`pressed` and
   `Go Receptor`/`Press Receptor`.
2. A spritesheet containing multiple frames, commonly marked `2x1` or `4x1`.
3. A normal receptor plus a pressed overlay, such as `tap Flash`, `Go RecOverlay`, or `_rflash`.
4. Direction and actor redirection through `ButtonRedir`, rotation tables, and `.redir` files.

The pressed osu! image uses only the texture classified as pressed or overlay. It is not composited
over the normal receptor.

## Architecture

### Shared receptor model

`src/engine/receptor.ts` defines a format-neutral model:

```ts
type ReceptorDirection = "left" | "down" | "up" | "right"
type ReceptorState = "normal" | "pressed"

type ReceptorImageRecipe = {
  filePath: string
  frame?: {
    column: number
    row: number
    columns: number
    rows: number
  }
  rotation: 0 | 90 | 180 | 270
}

type ReceptorCandidate = {
  recipe: ReceptorImageRecipe
  confidence: number
  reason: string
  sourceFile: string
}

type ReceptorPair = {
  normal: ReceptorImageRecipe
  pressed: ReceptorImageRecipe
  warnings: string[]
}

type ReceptorSet = Record<ReceptorDirection, ReceptorPair>
```

This model contains resolved image instructions, not Etterna AST nodes or osu! output paths.

### Etterna reader

Everything that understands Etterna lives under `src/engine/etterna/receptors/`:

- `analyze-noteskin.ts` parses `NoteSkin.lua` and extracts `ButtonRedir`, `Rotate`, inline receptor
  actors, texture expressions, frame declarations, and state commands.
- `analyze-receptor.ts` analyzes external `*Receptor.lua` actors and correlates
  `ReceptorArrow`/`ReceptorOverlay` commands from `metrics.ini`.
- `evaluate-expression.ts` evaluates only a safe static subset of Lua expressions: string
  literals, identifiers from a controlled environment, and string concatenation.
- `resolve-files.ts` follows `.redir` files and resolves `NOTESKIN:GetPath` results to files inside
  the selected skin directory.
- `confidence.ts` ranks candidates and records diagnostics.

The reader never executes noteskin Lua.

### Shared image transformations

`src/transform/image.ts` owns generic operations implemented with `sharp`:

- read image metadata;
- extract a spritesheet frame;
- rotate by a multiple of 90 degrees;
- proportionally reduce images that exceed a bounding box;
- place an image at a requested canvas alignment;
- encode PNG output.

This module does not know Etterna naming conventions or osu! output paths.

### osu! writer

`src/engine/osu/write-receptors.ts` consumes a `ReceptorSet` and the converted osu! hit position.
It owns:

- the `150 px` canvas width;
- the base height read from the copied `receptor-base.png`;
- the canvas-height formula;
- top alignment and horizontal centering;
- final osu! filenames and directories.

### Conversion orchestration

`src/conversion/etterna-to-osu.ts` coordinates the existing migration:

1. Read the Etterna profile and calculate the converted osu! hit position.
2. Analyze the selected Etterna skin into a complete `ReceptorSet`.
3. Render all eight receptor buffers.
4. Write the osu! receptor files.
5. Render known `skin.ini` wildcards.

The existing template-copy step remains outside the renderer and runs before these operations.

## Static discovery algorithm

For each of `left`, `down`, `up`, and `right`:

1. Inspect `NoteSkin.lua` for an inline receptor factory used when the requested element is
   `Receptor`.
2. If the receptor is delegated through `LoadActor(NOTESKIN:GetPath(Button, Element))`, resolve
   `ButtonRedir`, then locate the direction's `Receptor.lua` or `.redir`.
3. Follow `.redir` chains case-insensitively and reject cycles.
4. Collect every `Def.Sprite` texture expression and its frame and command metadata.
5. Resolve texture expressions using only the safe static evaluator.
6. Resolve each path against actual files in the selected skin directory:
   - comparisons are case-insensitive;
   - extensions may be omitted;
   - StepMania suffixes such as `2x1`, `4x1`, `(doubleres)`, and `(res 64x64)` may follow the
     logical path;
   - resolved paths must remain inside the skin directory.
7. Apply the direction's rotation from the noteskin configuration.
8. Classify and score normal and pressed candidates.

## Candidate confidence

Evidence is ranked in this order:

1. Explicit visibility transitions: normal is visible initially and hidden on press; pressed is
   hidden initially and shown on press.
2. Explicit `ReceptorOverlay` behavior from Lua or `metrics.ini`.
3. Semantic pairs such as `release`/`pressed` and `Go Receptor`/`Press Receptor`.
4. Declared spritesheet frames and `NxM` filename metadata.
5. Filename-only fallback.

When multiple candidates exist, the highest-confidence candidate is selected and the discarded
alternatives are reported as warnings with their source file, reason, and confidence.

When no candidate exists for either state, conversion stops with a diagnostic containing the
direction, searched files, and unresolved expressions. A conversion cannot produce a valid osu!
skin without both states.

## Spritesheet rules

Frame grids are read from explicit metadata when available and otherwise inferred from `NxM`
filename markers and image dimensions.

- A texture controlled as an overlay is a pressed candidate even when it shares a file with the
  normal actor.
- When a single `2x1` receptor texture is the only receptor asset, frame `0` is the normal
  candidate and frame `1` is the pressed candidate.
- Explicit actor state behavior overrides filename and frame heuristics.

## Image rendering

The copied `receptor-base.png` supplies:

- canvas width: currently `150 px`;
- default canvas height: currently `356 px`.

The desired height is:

```ts
baseHeight + (gamesDefault.osu.hitposition - convertedHitPosition) * 3
```

The rule is linear in both directions:

- `HitPosition 432` produces `356 + 18 = 374 px`;
- `HitPosition 440` produces `356 - 6 = 350 px`.

For each resolved normal or pressed recipe:

1. Decode the source image.
2. Extract the selected frame when applicable.
3. Apply the resolved direction rotation.
4. Reduce proportionally only when width or height exceeds `150 px`; never upscale a smaller
   receptor.
5. Calculate the canvas height as the greater of the desired height and the rendered receptor
   height.
6. Place the receptor at the top of the canvas and center it horizontally.
7. Leave all remaining canvas pixels transparent.
8. Encode the result as PNG.

All eight buffers are prepared successfully before output files are written.

## osu! output

The writer creates `output_folder/mania/receptors/` and writes:

```text
left.png
left_tap.png
down.png
down_tap.png
up.png
up_tap.png
right.png
right_tap.png
```

These names match the existing extensionless paths in the `skin.ini` template:

```ini
KeyImage0: mania\receptors\left
KeyImage0D: mania\receptors\left_tap
```

## Error handling and diagnostics

- Lua parse errors identify the source file and parser location.
- Unsupported dynamic expressions become unresolved-expression diagnostics rather than being
  executed.
- `.redir` cycles identify the complete chain.
- Ambiguities select the highest-confidence candidate and emit warnings.
- Missing normal or pressed candidates stop conversion.
- Image decode, crop, rotate, and encode errors include the source recipe.
- Output directory and write failures include the target path.

Warnings are returned by the reader and surfaced by the conversion orchestrator. They are not
silently discarded.

## Testing

Tests use compact repository fixtures derived from the observed patterns rather than depending on
the untracked `tmp` directory.

Etterna reader tests cover:

- inline `release`/`pressed`;
- inline `Go Receptor`/`Press Receptor`;
- external `Receptor.lua`;
- normal plus overlay;
- `2x1` and `4x1` spritesheets;
- `ButtonRedir` and rotation;
- `.redir` resolution, case differences, and cycles;
- safe string concatenation;
- confidence selection and warnings;
- missing-state diagnostics.

Image tests create synthetic PNGs and cover:

- frame extraction;
- rotations;
- proportional downscaling;
- no upscaling;
- top alignment and horizontal centering;
- transparent remaining pixels;
- canvas growth and shrinkage;
- minimum height equal to the rendered receptor height.

osu! writer tests cover:

- all eight filenames;
- creation of `mania/receptors`;
- normal and pressed mapping;
- no writes until all eight buffers render successfully.

An integration test uses a temporary representative Etterna skin and output directory to verify
the complete discovery and rendering flow without writing to the real templates, `tmp`, or
`output_folder`.

## Dependencies

Add `sharp` as a runtime dependency. `luaparse` remains the parser for all Lua analysis.
