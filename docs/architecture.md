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

- `adapters/etterna` discovers skins, statically reads gameplay positions and `ReceptorSize`
  from `playerConfig.lua`, performs static NoteSkin analysis, and resolves Etterna assets.
- `adapters/osu` renders `skin.ini` and writes image assets using osu! naming and layout
  conventions. Its receptor calibration converts the target column width into a
  vertical-only image scale before composition.

An Etterna read creates one `NoteSkinContext`. Receptor and tap-note analysis share this
context so the Lua source and skin directory are indexed only once.

### `conversions`

Owns equivalences between a specific source and target format. The Etterna-to-osu!
conversion currently maps hit position and validates the route. It does not parse Lua,
process pixels, write files, or interact with the user.

### `infrastructure`

Contains technical implementations shared by adapters:

- safe static Lua parsing and AST operations;
- Sharp-based frame extraction, rotation, and rendering;
- filesystem copying and transactional publication.

Etterna Lua is parsed and inspected but never executed.

### `config`

Contains runtime paths and installation defaults. Format rules do not belong here; they
remain with their adapter or conversion.

### `cli`

Collects user choices, wires implementations, invokes the application use case, and presents
diagnostics or fatal errors.

### `templates`

Contains the complete static osu! output skeleton copied into the staging workspace before
target-specific rendering. The bundle currently includes `skin.ini` and
`receptor-base.png`.

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

- neutral metadata and playfield configuration, including column width in the current
  model game's units;
- direction-keyed normal and pressed receptors;
- direction-keyed tap notes;
- typed diagnostics accumulated during static analysis.

`ImageAsset` represents a file, optional spritesheet frame, and rotation. Pixel processing
is deferred until the target writer requests it.

The Etterna-to-osu! conversion maps `ReceptorSize` units to osu! `ColumnWidth`. The osu!
adapter owns empirical pixel calibration, while the image infrastructure receives only a
generic vertical scale and geometry. The osu! adapter supplies logical playfield height and
rendered column width, plus a named logical bottom offset from its calibration module. Image
infrastructure converts that geometry into source-pixel padding, removes input-specific
trailing transparency, and composes the receptor above the calculated footer without
embedding osu!-specific constants. Target calibration values remain outside infrastructure,
keeping source properties and target rendering details out of the neutral domain.

## Transactional Publication

The output publisher builds the entire result in a temporary sibling of `output_folder`.
After a successful build, it moves the previous output to a temporary backup and promotes
the staged result. If promotion fails, it restores the backup. A build failure removes only
staging and preserves the previously published output.

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
