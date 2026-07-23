# Etterna Note Migration Design

## Goal

Convert Etterna tap-note images into the four static osu!mania note images referenced by the existing `skin.ini` template:

```text
mania/notes/left.png
mania/notes/down.png
mania/notes/up.png
mania/notes/right.png
```

This phase covers tap notes only. Long-note bodies and tails remain outside the scope.

## Constraints

- Only Etterna → osu conversion is implemented.
- Lua is parsed statically and never executed.
- Note selection follows the texture mapping declared by `NoteSkin.lua`, inline `createNote` functions, direction-specific `Tap Note.lua` files, and `.redir` files.
- `ButtonRedir` and legacy `RedirTable` mappings are supported.
- Rotation is applied only when `PartsToRotate["Tap Note"]` is explicitly `true`.
- The direction-specific value from the `Rotate` table determines the rotation angle.
- Selected frames retain their original pixel dimensions. No resize or canvas padding is applied.
- Output images are PNG files with the exact names used by `skin.ini`.
- All four output buffers are prepared successfully before the output directory is created or any note file is written.

## Discovery Strategy

The analyzer parses `NoteSkin.lua` once and builds a shared Etterna context containing:

- `ButtonRedir` or `RedirTable`;
- `Rotate`;
- `PartsToRotate`;
- named inline functions such as `createNote`;
- the source path and resolver needed for delegated Lua files.

For each of `left`, `down`, `up`, and `right`, it resolves the effective `Tap Note` loader:

1. Use an inline `createNote(direction)` implementation when present.
2. Otherwise resolve the effective direction through `ButtonRedir` or `RedirTable`.
3. Load the matching `<Direction> Tap Note.lua`.
4. Follow `<Direction> Tap Note.redir` chains with the existing cycle and skin-boundary checks.
5. Evaluate supported texture expressions, including string literals, controlled identifiers, concatenation, and `NOTESKIN:GetPath(...)`.
6. Resolve the physical image case-insensitively and without requiring an extension.

Filename scanning is only a low-confidence fallback. It must not override an explicit Lua texture mapping.

## Frame Selection

Etterna filename metadata `MxN` is interpreted as `M` columns and `N` rows. Frame indices are row-major.

Frame selection happens only after all four directions have resolved their physical source images:

1. **Dedicated per-direction images:** use frame `0` from each selected image. A `1x1` image is copied without frame extraction.
2. **One shared `1xN` image for all four directions:** use frame `0` for `left` and `right`, and frame `1` for `down` and `up`.
3. **Multiple `1xN` images:** follow the Lua mapping for each direction and use frame `0` from each mapped image. This covers skins such as `shurikey_green`, where edge and middle columns can load different sheets.
4. **Any `MxN` image where `M > 1`:** use frame `0` for every direction mapped to that image.

The shared edge/middle rule applies only when all four directions resolve to the same physical `1xN` image with at least two frames.

## Rotation

After frame extraction:

- If `PartsToRotate["Tap Note"]` is `true`, rotate the selected frame by `Rotate[direction]`.
- Negative angles are normalized to their equivalent value from `0` through `359`.
- If `PartsToRotate["Tap Note"]` is absent or false, no rotation is applied.

Rotation may swap width and height, but the resulting dimensions are otherwise preserved.

## Components

### Shared note model

`src/engine/note.ts` defines a format-neutral resolved note image:

- physical source path;
- optional spritesheet frame;
- rotation.

### Shared Etterna NoteSkin context

`src/engine/etterna/noteskin-context.ts` owns parsing of direction redirects, rotations, `PartsToRotate`, and named inline functions. The existing receptor analyzer will consume this context so receptors and notes do not maintain different interpretations of the same `NoteSkin.lua`.

### Etterna note analysis

`src/engine/etterna/notes/analyze-tap-note.ts` extracts texture declarations from one inline or external Lua source.

`src/engine/etterna/notes/analyze-notes.ts` resolves the four effective sources, applies the frame-selection rules, and produces a complete direction-to-note mapping plus warnings.

All logic in these files is Etterna-specific.

### Image transformation

`src/transform/image.ts` gains a format-neutral operation that:

1. extracts an optional frame into a separate buffer;
2. applies an optional rotation;
3. encodes the result as PNG;
4. performs no resize, padding, or canvas composition.

The existing receptor canvas operation remains separate.

### osu writer

`src/engine/osu/write-notes.ts` renders all four buffers in memory and then writes them to `mania/notes`.

### Conversion orchestration

`src/conversion/etterna-to-osu.ts` performs receptor and tap-note analysis, renders both asset groups, writes the existing `skin.ini`, and returns accumulated non-fatal warnings.

## Errors and Warnings

- A missing `NoteSkin.lua`, unresolved `Tap Note` loader, missing texture, invalid frame layout, or absent direction fails conversion with the direction and Lua source path in the message.
- `.redir` cycles and paths escaping the skin directory remain hard errors.
- When several physical images match a low-confidence fallback, the deterministic highest-confidence match is used and a warning lists the alternatives.
- No note output is written unless all four directions can be rendered.

## Testing

Unit tests use compact temporary fixtures and synthetic PNGs. They cover:

- one dedicated image per column;
- inline `createNote(direction)`;
- external `Tap Note.lua`;
- `.redir`, `ButtonRedir`, and `RedirTable`;
- shared `1xN` frame `0/1` edge/middle mapping;
- multiple `1xN` sheets using frame `0` from the Lua-selected image;
- `MxN`, with `M > 1`, using frame `0`;
- rotation enabled and disabled through `PartsToRotate`;
- original-size preservation;
- exact output names;
- no partial note output after a render failure;
- full Etterna → osu integration.

After the automated suite passes, every skin under `tmp` is analyzed and rendered into temporary output to validate the observed real-world patterns without modifying the sample skins.
