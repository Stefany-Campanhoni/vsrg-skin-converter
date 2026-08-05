# Architecture

## Purpose

VSRG Skin Converter translates rhythm-game skins through a game-neutral model. The current
supported route is Etterna to osu!, but source readers, semantic conversions, and target
writers are intentionally independent so another direction can be added without rewriting
the application flow.

## Conversion Flow

```text
CLI
  -> source SkinCatalog
  -> source SkinReader
  -> neutral SkinModel
  -> source-to-target SkinConversion
  -> target SkinWriter
  -> TransactionalOutputPublisher
```

The CLI is the composition root. It selects concrete implementations and passes them to the
application use case. The application layer coordinates the operation exclusively through
ports.

## Layers

### `domain`

Defines game identifiers, directions, image assets, skin data, and diagnostics. It has no
knowledge of Lua, Sharp, filesystems, prompts, or game-specific formats.

### `application`

Contains the conversion use case, the source-target conversion registry, and ports for skin
catalogs, readers, writers, and output publication. It depends only on the domain.

### `adapters`

Translates external game formats to and from the neutral model.

- `adapters/etterna` discovers skins, statically reads gameplay positions, `ReceptorSize`,
  `JudgmentZoom`, and `ComboZoom` from `playerConfig.lua`, performs static NoteSkin analysis,
  and resolves Etterna assets.
- `adapters/osu` renders `skin.ini` and writes image assets using osu! naming and layout
  conventions. Its receptor calibration converts the target column width into a
  vertical-only image scale before composition. It applies neutral judgement and combo scale
  factors to image outputs without changing `skin.ini`.

Fixed osu! long-note assets are published by a target writer without entering the image
pipeline. After every target asset succeeds, an allowlisted finalizer removes only known
internal template artifacts from the staged workspace.

The CLI discovers Etterna local profiles and selects one before constructing the source
reader. The Etterna adapter resolves the active theme from `Preferences.ini` and uses one
named reader configuration for both playfield and judgement reads. A central Etterna path
module validates profile IDs and theme names before composing settings paths.

Etterna asset adapters resolve the selected profile's judgement and playfield configuration,
then convert Etterna sheet coordinates into a semantic `JudgementSet`. The conversion
preserves that format-neutral set. Generic Sharp infrastructure extracts and scales frames,
while the osu! writer publishes the named SD and HD judgement files.

The source adapter maps `ComboZoom` directly to `comboScale` and maps `JudgmentZoom` to
`judgementScale` with `1 + (zoom - 1) * 0.5`. Generic image infrastructure proportionally
resizes rounded, minimum-one-pixel dimensions. After template copying, the osu! adapter
overwrites the `combo` digit, comma, and dot sprites and their `@2x` variants at
`comboScale`. The separate `score` and `scoreentry` sprites remain fixed template assets.

An Etterna read creates one `NoteSkinContext`. Receptor and tap-note analysis share this
context so the Lua source and skin directory are indexed only once.

### `conversions`

Owns equivalences between a specific source and target format. The Etterna-to-osu!
conversion maps hit position, combo position, judgement/score position, and column width
using named game defaults and preserves the neutral combo and judgement scale factors. For
these coordinates, the osu! writer only serializes already-converted target values. The
conversion does not parse Lua, process pixels, write files, or interact with the user.

### `infrastructure`

Contains technical implementations shared by adapters:

- safe static Lua parsing and AST operations;
- Sharp-based frame extraction, rotation, and rendering;
- filesystem copying and transactional publication.

Concurrent infrastructure batches use one typed quiescent waiter: every sibling settles
before the batch returns or rethrows the original first input-order failure. Injected
callbacks are started through `invokeAsPromise`, which preserves eager startup while turning
a synchronous throw into a rejected task that participates in the same settlement barrier.

Etterna Lua is parsed and inspected but never executed.

### `config`

Contains runtime paths and installation defaults. Format rules do not belong here; they
remain with their adapter or conversion.

### `cli`

Collects user choices, wires implementations, invokes the application use case, and presents
diagnostics or fatal errors.

### `templates`

Contains the complete static osu! output skeleton copied into the staging workspace before
target-specific rendering. The bundle includes `skin.ini`, internal receptor and long-note
sources, global cursor/countdown/sound assets, fixed score and ranking glyphs, and the SD and
`@2x` combo glyphs. Target writers transform only the assets they own, and the finalizer
removes internal build-only sources after every output task succeeds.

## Dependency Rules

Production dependencies must follow these directions:

```text
cli -> application, adapters, conversions, infrastructure, config, domain
adapters -> application, infrastructure, config, domain
conversions -> application, config, domain
infrastructure -> application, domain
application -> domain
domain -> no other project layer
config -> no other project layer
```

Dependencies within the same layer are allowed. Production dependency cycles are forbidden.
`npm run test:architecture` enforces the matrix and cycle rule from relative imports.

## Domain Boundary

`SkinModel` is the only data exchanged between a reader, conversion, and writer. It contains:

- neutral metadata and playfield configuration, including column width in the current model
  game's units and neutral combo and judgement image scale factors;
- direction-keyed normal and pressed receptors;
- direction-keyed tap notes;
- typed diagnostics accumulated during static analysis.

`ImageAsset` represents a file, optional spritesheet frame, and rotation. Pixel processing
is deferred until the target writer requests it.

The Etterna-to-osu! conversion maps `ReceptorSize` units to osu! `ColumnWidth`. The osu!
adapter owns empirical pixel calibration, while the image infrastructure receives only a
generic vertical scale and geometry. The osu! adapter supplies logical playfield height,
rendered column width, receptor normalization size, and a named logical bottom offset from
its calibration module. Image infrastructure converts that geometry into source-pixel
padding, removes input-specific trailing transparency, and composes the receptor above the
calculated footer without embedding osu!-specific constants. Target calibration values
remain outside infrastructure, keeping source properties and target rendering details out
of the neutral domain.

## Transactional Publication

The output publisher builds the entire result in a temporary sibling of the selected
`%LOCALAPPDATA%/osu!/Skins/<skin name>` directory.
After a successful build, it moves the previous output to a temporary backup and promotes
the staged result. If promotion fails, it restores the backup. A build failure removes only
staging and preserves the previously published output.

The CLI supplies an absolute `LOCALAPPDATA` root, and runtime-path configuration rejects
unsafe skin-name segments before publication. This keeps every generated target exactly one
directory below the osu! `Skins` root.

Therefore writers must treat their workspace as a complete target, not as an incremental
patch over an existing skin.

## Adding a Conversion Route

1. Add or reuse a source `SkinCatalog` and `SkinReader`.
2. Add or reuse a target `SkinWriter`.
3. Implement `SkinConversion` for the exact source-target pair.
4. Register the route in the CLI composition root.
5. Add unit tests for format behavior and a cross-module integration test.
6. Run the architecture and full verification commands.

Do not add conditionals for unrelated games inside an existing adapter. A reverse route
should reuse neutral domain concepts while keeping each format's parsing and rendering rules
inside its own adapter.
