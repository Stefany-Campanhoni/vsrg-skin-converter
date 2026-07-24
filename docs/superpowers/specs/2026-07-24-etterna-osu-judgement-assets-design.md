# Etterna-to-osu! Judgement Asset Conversion Design

**Status:** Approved and reviewed

## Goal

Convert the judgement graphic selected by the single supported Etterna profile into the
six static osu!mania judgement assets referenced by the production `skin.ini`, while
preserving visual size across standard- and double-resolution source images.

The feature applies only to the Etterna-to-osu! conversion direction. Its domain model
and component boundaries must remain suitable for a future osu!-to-Etterna conversion.

## Scope

The converter will:

- read the profile GUID from
  `Save/LocalProfiles/00000000/Etterna.xml`;
- read the selected judgement path from
  `Save/Rebirth_settings/assetsConfig.lua`;
- reproduce Etterna's configured-path fallback to `judgment.default`;
- accept Etterna judgement sheets declared as `1x6` or `2x6`;
- select the left, Early column from `2x6` sheets;
- map the six Etterna judgement rows to semantic judgement grades;
- generate standard- and double-resolution PNGs for every grade;
- publish the generated assets under `mania/judgements`;
- preserve the existing transactional publication and quiescent failure behavior.

The converter will not:

- discover or select among multiple local profiles;
- convert osu! judgement assets back into an Etterna spritesheet;
- preserve Etterna's Early/Late distinction;
- create osu! judgement animations;
- infer an undeclared spritesheet layout from image dimensions;
- convert judgement zoom, animation commands, or other theme behavior;
- change the existing judgement paths in `skin.ini`.

## Observed Etterna Format

All inspected assets under `tmp/judgements` declare either `1x6` or `2x6` in their
filenames. The six rows are consistently ordered:

| Etterna row | Etterna score | Semantic grade | osu!mania key | Output stem |
| ---: | --- | --- | --- | --- |
| 0 | `TapNoteScore_W1` | Marvelous | `Hit300g` | `marvelous` |
| 1 | `TapNoteScore_W2` | Perfect | `Hit300` | `perfect` |
| 2 | `TapNoteScore_W3` | Great | `Hit200` | `great` |
| 3 | `TapNoteScore_W4` | Good | `Hit100` | `good` |
| 4 | `TapNoteScore_W5` | Bad | `Hit50` | `bad` |
| 5 | `TapNoteScore_Miss` | Miss | `Hit0` | `miss` |

Etterna's own judgement loader confirms the layout:

- a six-state texture selects states `0` through `5`;
- a twelve-state texture multiplies the row by two;
- the left/even state is selected for an Early judgement;
- the right/odd state is selected for a Late judgement.

The conversion intentionally uses the left/Early state. Therefore:

- a `1x6` sheet uses frame indices `0, 1, 2, 3, 4, 5`;
- a `2x6` sheet uses frame indices `0, 2, 4, 6, 8, 10`.

The filename marker `(Doubleres)` is case-insensitive and denotes a source whose physical
dimensions are twice its logical display dimensions. The inspected normal and
double-resolution `shiny` sheets confirm this relationship with `64x64` and `128x128`
frames, respectively.

## Profile and Asset Selection

### Profile GUID

For this feature, the only supported profile is `00000000`. A dedicated Etterna adapter
reads:

```text
<game root>/Save/LocalProfiles/00000000/Etterna.xml
```

The reader extracts exactly one non-empty `<Guid>` value. It does not introduce a general
XML dependency because the supported contract is one known scalar tag in one known file.
Missing files, zero GUID tags, multiple GUID tags, and empty GUID values are errors that
include the profile path.

### Asset configuration

A dedicated Etterna adapter parses:

```text
<game root>/Save/Rebirth_settings/assetsConfig.lua
```

The adapter uses `luaparse` and the project's shared Lua AST primitives. It never executes
the Lua file. It requires a returned root table containing a `judgment` table and a
non-empty `default` string.

Selection follows this order:

1. Read `judgment[guid]`.
2. Resolve and validate `judgment.default` as a regular in-root image file; the default
   remains a required usable fallback even when the GUID-specific file exists.
3. If the GUID mapping is absent, select the validated default and add a warning
   diagnostic.
4. Resolve the GUID-specific relative path against the Etterna game root.
5. If the GUID-specific file does not exist, select the validated default and add a
   warning
   diagnostic.

A malformed configuration is an error rather than a fallback condition.

### Path safety

Configured asset paths must be relative to the Etterna game root. Absolute paths,
segments equal to `..`, or resolved paths outside the game root are rejected without
fallback. The resolved file must be a regular image file supported by the existing image
pipeline.

The GUID-specific path and the default path are both subject to the same safety checks.

## Etterna Filename Metadata

Judgement analysis reuses one Etterna-specific filename metadata parser rather than
duplicating the private rules currently used by the NoteSkin file resolver. The targeted
refactor must preserve all existing NoteSkin filename behavior and tests.

The parser recognizes, without case sensitivity:

- a terminal `1x6` or `2x6` layout declaration;
- optional trailing decorations such as `(Doubleres)` or existing Etterna resolution
  metadata.

Judgement analysis accepts only:

- one or two columns;
- exactly six rows;
- image dimensions evenly divisible by the declared columns and rows.

Missing metadata, any other grid, or incompatible pixel dimensions produces an error that
identifies the file and states the expected layouts.

## Domain Model

Judgement grades are format-neutral domain concepts:

```ts
export const judgementGrades = [
  "marvelous",
  "perfect",
  "great",
  "good",
  "bad",
  "miss",
] as const

export type JudgementGrade = (typeof judgementGrades)[number]

export interface JudgementSet {
  sourceDensity: 1 | 2
  images: Record<JudgementGrade, ImageAsset>
}
```

`SkinAssets` gains an optional `judgements?: JudgementSet` field. The field stays optional
at the general domain boundary because not every future reader must necessarily provide
it. The Etterna reader populates it for this conversion, and the osu! writer requires it
before writing an osu! target.

Every judgement `ImageAsset` references the selected physical file, has rotation `0`, and
contains the semantic frame selected by the Etterna adapter. All six entries share one
source density because they originate from one sheet.

This representation prevents Etterna row ordering, Early/Late columns, GUIDs, and
filename decorations from leaking into the conversion or osu! writer.

## Component Responsibilities

### Etterna asset adapters

Focused Etterna-only units own:

- extracting the fixed profile's GUID;
- parsing the asset configuration;
- resolving GUID-specific and default paths safely;
- parsing Etterna image filename metadata;
- validating the judgement sheet;
- mapping sheet frames to a `JudgementSet`;
- producing fallback diagnostics.

These units return domain data and diagnostics; they do not render or write images.

### `EtternaSkinReader`

The reader loads judgement analysis alongside the existing playfield and NoteSkin work.
The GUID and asset-configuration reads are sequential inside the judgement analysis, but
the complete judgement analysis can run concurrently with the independent profile and
NoteSkin reads.

Its returned model includes:

```ts
assets: {
  receptors,
  tapNotes,
  judgements,
}
```

Judgement diagnostics are appended to the existing receptor and note diagnostics.

### `EtternaToOsuConversion`

The conversion does not reinterpret judgement assets. Its existing immutable spread
preserves the semantic `JudgementSet` while it converts playfield coordinates. No
Etterna filename rule or osu! output filename belongs in this layer.

### Generic Sharp processing

The image infrastructure gains a focused judgement-variant renderer. It:

1. validates and extracts the selected complete frame;
2. preserves the full frame canvas and alpha channel;
3. performs no trimming, padding, rotation, or repositioning;
4. encodes standard- and double-resolution PNG buffers.

Frame extraction must share the existing generic validation behavior rather than
duplicating spritesheet arithmetic.

### osu! writer

A dedicated `writeOsuJudgements` module:

- consumes a semantic `JudgementSet`;
- renders all twelve buffers before any judgement file is written;
- creates `mania/judgements`;
- writes the twelve exact filenames;
- waits for all sibling render or write operations before propagating the first
  input-order failure.

`OsuSkinWriter` validates the presence of judgements and includes
`writeOsuJudgements` in the same quiescent publication batch as receptors, notes, and
long notes. It remains an orchestrator.

## Resolution Conversion

Each semantic grade always produces an SD and HD file.

### Standard-resolution source

For a source without `(Doubleres)`:

- `<grade>.png` is the extracted original frame;
- `<grade>@2x.png` is resized to 200% of the frame width and height.

### Double-resolution source

For a source with `(Doubleres)`:

- `<grade>@2x.png` is the extracted original frame;
- `<grade>.png` is resized to 50% of the frame width and height.

Sharp uses the `lanczos3` kernel for both resize directions and preserves alpha. Computed
dimensions must be positive integers. A halved dimension that is not an integer is rounded
to the nearest integer with `Math.round`, consistently with the project's other numeric
conversion policies.

The original-density variant is re-encoded as PNG but is not resized.

## Output Contract

The generated workspace contains:

```text
mania/judgements/
├── miss.png
├── miss@2x.png
├── bad.png
├── bad@2x.png
├── good.png
├── good@2x.png
├── great.png
├── great@2x.png
├── perfect.png
├── perfect@2x.png
├── marvelous.png
└── marvelous@2x.png
```

The existing production template remains unchanged:

```ini
Hit0: mania\judgements\miss
Hit50: mania\judgements\bad
Hit100: mania\judgements\good
Hit200: mania\judgements\great
Hit300: mania\judgements\perfect
Hit300g: mania\judgements\marvelous
```

The converter does not generate `-0`, `-1`, or other animation suffixes.

## Failure and Publication Semantics

The following conditions fail conversion with actionable paths and expected values:

- missing or invalid profile GUID;
- missing or malformed `assetsConfig.lua`;
- missing or invalid `judgment` table or default;
- unsafe configured paths;
- selected and default files both unavailable;
- unsupported filename layout;
- incompatible image dimensions;
- frame extraction or resize failure;
- output directory or file write failure.

Fallback is limited to a missing GUID-specific mapping or a missing GUID-specific file.
It does not hide malformed configuration, unsafe paths, invalid layouts, or image
processing failures.

The existing transactional publisher protects the final target directory. Within the
workspace, judgement rendering and writing use `settleAll`, so a rejection is not exposed
while sibling operations remain active.

## Testing Strategy

### Profile and configuration tests

- Extract the only GUID from profile `00000000`.
- Reject missing, empty, or multiple GUIDs.
- Select a GUID-specific judgement path.
- Fall back when the GUID mapping is absent.
- Fall back when the GUID-specific file is missing.
- Reject a missing or unusable default.
- Reject malformed Lua without executing it.
- Reject absolute paths, traversal, and paths outside the game root.

### Filename and analysis tests

- Preserve existing NoteSkin filename resolver behavior after extracting shared metadata
  parsing.
- Accept case-insensitive `1x6`, `2x6`, and `(Doubleres)`.
- Map `1x6` to indices `0` through `5`.
- Map the left column of `2x6` to `0, 2, 4, 6, 8, 10`.
- Verify every row maps to the correct semantic grade.
- Reject missing layouts, unsupported grids, and incompatible dimensions.
- Verify fallback warnings are included in the returned diagnostics.

### Image processing tests

Synthetic sheets use distinct colors and transparent pixels to prove:

- the correct `1x6` and left-column `2x6` frames are extracted;
- frame canvas size and alpha are preserved;
- an SD source keeps the original SD dimensions and doubles HD dimensions;
- a Doubleres source keeps the original HD dimensions and halves SD dimensions;
- fractional half-size dimensions are rounded to the nearest integer;
- the requested resize kernel and PNG encoding produce usable buffers.

### Writer tests

- Produce all twelve exact paths.
- Render every grade before starting writes.
- Wait for every render before exposing a render failure.
- Wait for every write before exposing a write failure.
- Preserve the exact first input-order error object.
- Reject an osu! model without judgements.
- Keep receptor, tap-note, long-note, cleanup, and template behavior unchanged.

### Integration test

An end-to-end fixture supplies:

- `Etterna.xml` with one GUID;
- `assetsConfig.lua` with GUID and default paths;
- a selected synthetic `2x6` sheet;
- the existing NoteSkin, playfield, and template fixtures.

The test runs the real reader, conversion, writer, and transactional publisher. It
verifies:

- the left/Early frame for all six grades;
- SD and HD dimensions;
- all twelve output filenames;
- absence of internal template artifacts;
- existing receptor, note, long-note, position, diagnostic, and publication assertions.

The full formatter, lint, test, typecheck, architecture, whitespace, and staging checks
remain required before completion.

## Future Compatibility

A future osu! reader can populate the same semantic `JudgementSet` from the six target
files. A future Etterna writer can then combine those semantic images into an Etterna
sheet without changing the domain contract.

Supporting multiple profiles, choosing an Early/Late policy dynamically, or producing
animated osu! hit bursts requires a separate design.
