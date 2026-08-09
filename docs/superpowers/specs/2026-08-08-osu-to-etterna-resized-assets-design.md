# osu! to Etterna Resized Assets Design

## Scope

Change only the osu!mania-to-Etterna conversion. Generated tap notes and receptors use
Etterna logical-resolution filenames and fixed physical PNG dimensions. The existing
Etterna-to-osu! conversion remains behaviorally unchanged.

This change does not add reverse judgement, long-note, font, or combo-zoom migration.

## Output Contract

Every generated tap note is a PNG with exact physical dimensions of 150 by 150 pixels.
Every generated receptor is a PNG with exact physical dimensions of 146 by 146 pixels.
Resizing uses fill semantics and therefore does not preserve the source aspect ratio.

Every generated tap-note and receptor filename ends with the fixed decoration
` (res 64x64).png`. No generated reverse-conversion note or receptor uses the
` (doubleres)` decoration.

Examples:

```text
Notes/_Left Tap Note (res 64x64).png
Receptors/release Left (res 64x64).png
Receptors/pressed Left (res 64x64).png
```

The selected osu! asset density remains source-only information. Explicit `@2x` and CFG
density rules still select the physical osu! source file, but the selected density does not
change the Etterna output filename.

## Responsibility Boundaries

The Etterna writer adapter owns named constants for:

- the fixed ` (res 64x64)` filename decoration;
- the 150-pixel tap-note width and height;
- the 146-pixel receptor width and height.

Generic exact PNG resizing remains an infrastructure image operation. The adapter passes
the target dimensions and retains ownership of the game-specific calibration.

The domain model keeps source density metadata because the osu! reader and resolver use it
to select the correct source asset. Writers do not require density metadata to construct
the new fixed Etterna filenames.

## Tap-Note Flow

For every 4K direction, the writer:

1. reads the selected osu! PNG;
2. resizes the complete image directly to 150 by 150 pixels using fill semantics;
3. encodes the result as PNG;
4. writes it under the direction-specific logical name followed by
   ` (res 64x64).png`.

No transparent trimming or frame rotation is added to this flow.

## Receptor Flow

For every direction and state, the writer preserves the approved transformation order:

1. read the selected osu! PNG;
2. inspect transparency;
3. remove transparent rows only from the top and bottom when visible pixels exist;
4. stretch the vertically trimmed region to `source width × source width`;
5. resize the square result directly to 146 by 146 pixels;
6. encode the result as PNG;
7. write it under the state- and direction-specific logical name followed by
   ` (res 64x64).png`.

Lateral transparent columns are never trimmed.

A fully transparent normal receptor remains fully transparent but is encoded at 146 by 146
pixels. A fully transparent pressed receptor reuses the already processed 146-by-146 normal
receptor from the same direction. Both normal and pressed files are always generated.

## Failure and Concurrency Contract

Image decoding, resizing, source reads, and output writes remain fatal for the conversion.
Contextual errors identify the asset direction, receptor state where applicable, source or
destination path, and preserve the exact lower-level error as `cause`.

Concurrent preparation and writing remain quiescent: all started sibling operations settle
before the batch reports a failure. A preparation failure publishes neither generated asset
group.

## Testing

Unit tests cover:

- exact fixed filenames independent of source density;
- exact 150-by-150 tap-note dimensions;
- exact 146-by-146 receptor dimensions;
- fill resizing for non-square notes;
- receptor transformation order and preservation of lateral transparency;
- fully transparent normal output;
- pressed-transparent fallback to the processed normal receptor;
- lane and state identity through representative RGBA assertions;
- contextual failures, exact causes, and quiescent siblings.

The reverse integration fixture asserts all four tap notes and all eight receptors use the
new decoration and dimensions. It continues to exercise source-density selection. The full
Etterna-to-osu! integration suite runs unchanged as a forward-route regression.

## Documentation and Delivery

Current README, architecture, development standards, and agent prompt guidance are updated
where they describe reverse asset naming or geometry. Historical plans and specifications
remain unchanged.

All changes remain unstaged and uncommitted until reviewed in the IDE.
