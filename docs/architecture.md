# Architecture

## Purpose

VSRG Skin Converter translates rhythm-game skins through a game-neutral model. It supports
Etterna to osu! and a 4K-only osu!mania to Etterna route. Source readers, semantic
conversions, and target outputs remain direction-specific.

## Conversion Flow

```text
EtternaSkinReader -> EtternaToOsuConversion -> OsuSkinWriter
  -> TransactionalOutputPublisher

OsuSkinReader -> OsuToEtternaConversion -> EtternaSkinInstaller
  -> EtternaNoteSkinWriter + EtternaProfileWriter + EtternaJudgementWriter
  -> TransactionalOutputSetPublisher
```

The CLI is the composition root. It selects concrete implementations and passes them to the
application use case. The application layer coordinates the operation exclusively through
ports.

## Layers

### `domain`

Defines game identifiers, directions, image assets, skin data, and diagnostics. It has no
knowledge of Lua, Sharp, filesystems, prompts, or game-specific formats.

### `application`

Contains conversion use cases, the source-target conversion registry, and ports for skin
catalogs, readers, writers, installers, and single- or multi-target output publication. It
depends only on the domain.

### `adapters`

Translates external game formats to and from the neutral model.

- `adapters/etterna` discovers skins, statically reads gameplay positions, `ReceptorSize`,
  `JudgmentZoom`, and `ComboZoom` from `playerConfig.lua`, performs static NoteSkin analysis,
  and resolves Etterna assets. As a target, it validates NoteSkin/profile paths, owns fixed
  output filenames and dimensions, renders the Etterna templates, allocates profile identity,
  composes the judgement sheet, preserves the active theme asset configuration, and
  coordinates installation.
- `adapters/osu` discovers user CFGs and skins, parses repeated `skin.ini` sections, and
  resolves case-insensitive PNG references with explicit density. As a target, it renders
  `skin.ini` and writes image assets using osu! naming and layout conventions. Its receptor
  calibration converts the target column width into a vertical-only image scale before
  composition. As a source, its reader projects the four 4K column widths to their arithmetic
  mean before exposing the scalar through the neutral model.

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

The osu!-to-Etterna conversion owns the inverse position formulas and maps the scalar osu!
column width supplied by the reader into Etterna `ReceptorSize` units. It preserves the four
normal receptors, four pressed receptors, and four tap notes while deliberately leaving
fonts, long notes, and zoom migration out of the reverse scope. Judgements pass through the
neutral model without coordinate or scale conversion.

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

Collects user choices, dispatches to one direction-specific route, wires implementations,
invokes the application use case, and presents diagnostics or fatal errors. A dedicated
installation-directory coordinator checks default roots, pauses before opening the native
Windows folder picker, validates selected directories, and returns cancellation without
coupling that behavior to the composition root. The reverse route owns the explicit
overwrite prompt and cancels before profile allocation when it is declined.

### `templates`

Contains one static output bundle per target game. `templates/osu` is the complete osu!
output skeleton copied into the staging workspace before target-specific rendering. The
bundle includes `skin.ini`, internal receptor and long-note sources, global
cursor/countdown/sound assets, fixed score and ranking glyphs, and the SD and `@2x` combo
glyphs. Target writers transform only the assets they own, and the finalizer removes
internal build-only sources after every output task succeeds. `templates/etterna/noteskin`
and `templates/etterna/profile` are independent bundles used by the reverse installer; the
profile writer relocates `playerConfig.lua` below the active theme settings directory.

## Windows Portable Distribution

The maintained distribution pipeline is owned by `scripts/release`; it does not belong to a
conversion adapter. esbuild bundles `src/cli.ts` as Node-targeted ESM while keeping `sharp`
external. `src/application-root.ts` derives resources from `import.meta.url`, so the same
invariant resolves `src/templates` during source execution and sibling `templates` beside
`app.mjs` after packaging. No runtime resource depends on `process.cwd()`.

The Windows x64 package includes pinned Node.js 22.23.2 and only the proven Sharp runtime
closure: `sharp`, `detect-libc`, `semver`, `@img/colour`, and `@img/sharp-win32-x64`.
Typings, tests, source maps, caches, npm command shims, and wasm fallbacks are excluded. The
assembler copies external templates byte-for-byte into a unique staging sibling and promotes
the completed package transactionally. Only transient Windows `EPERM`/`EBUSY` rename failures
receive bounded backoff; validation and content errors never retry.

The Node cache is reusable only while the archive still matches its pinned SHA-256 and the
extracted runtime has a matching verification stamp, pinned `node.exe` SHA-256, and reported
`node --version`. A missing, stale, or tampered extraction is rebuilt from the verified
archive. Acquisition, runtime installation, and package assembly receive an explicit
controlled root and validate every staging, backup, cache, and output path before mutation.
Runtime installation retains its recovery backup when rollback cannot restore it.

The verifier rejects unexpected entries and links, compares every packaged template hash,
runs the launcher from an external working directory, exercises paths containing spaces,
performs a real Sharp resize with the included runtime, and reads both template roots. ZIP
publication uses a temporary archive and checksum, validates SHA-256, extracts independently,
repeats the full verifier, and only then replaces the previous release pair. The experimental
Node SEA workstream remains unmerged and is not part of this architecture.

## Version and Public Release Flow

Changesets is repository infrastructure rather than application or conversion code. Feature
branches add release-intent documents under `.changeset`; the pinned Changesets Action
combines them into one protected Release PR that updates the package manifests and
`CHANGELOG.md`. The application is private to npm, so Changesets versions it without tagging
or publishing it.

Merging the Release PR produces a `main` push with a coherent version change. The
draft-release workflow compares that commit with the previous `main` SHA, requires matching
package and lockfile versions plus an exact changelog heading, and treats all other pushes as
no-ops. A verified release runs the existing Windows distribution pipeline, then creates the
`v<version>` tag and a GitHub draft containing the ZIP and SHA-256. Prerelease SemVer values
are marked as prereleases, but no draft is publicly published without a second human action.

Conventional Commit checks are orthogonal to SemVer calculation: Husky and CI enforce clean
history, while Changesets files remain the sole source of release impact. The dedicated
`CHANGESETS_TOKEN` allows the automation-owned PR to trigger ordinary checks without giving
the Windows release job broader credentials; only that job receives `contents: write`.

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

For the reverse route, osu! density is resolved entirely by the source adapter. Receptor and
note density selects only the input file; judgement density also selects Etterna's standard
or `(Doubleres)` sheet name. The judgement source resolver owns `Hit*` references, directory
references, missing-property `mania-hit*` defaults, and `-0` frame precedence; the shared PNG
resolver remains responsible for case-insensitive, density-specific, skin-contained file access.
The target adapter always writes four
150x150 tap notes and eight 146x146 receptors using the fixed ` (res 64x64)` filename
decoration. Receptors are vertically trimmed, made into a source-width square, and then
resized to 146x146. A transparent normal remains transparent; a transparent pressed receptor
falls back to the processed normal from the same direction. Any future game-specific output
calibration belongs in the target adapter; shared image infrastructure implements only the
game-neutral trim, square, resize, and transparency mechanisms requested by that adapter.

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

The single-target output publisher builds the entire result in a temporary sibling of the selected
`<resolved osu! installation>/Skins/<skin name>` directory.
After a successful build, it moves the previous output to a temporary backup and promotes
the staged result. If promotion fails, it restores the backup. A build failure removes only
staging and preserves the previously published output.

Runtime-path configuration derives the default osu! installation from an absolute
`LOCALAPPDATA` root when available. If either default installation is missing, the CLI can
use an absolute directory selected through the native picker. Path configuration rejects
unsafe skin-name segments before publication, keeping every generated target exactly one
directory below the resolved osu! `Skins` root.

Therefore writers must treat their workspace as a complete target, not as an incremental
patch over an existing skin.

The reverse route publishes four non-overlapping targets as one transaction: the NoteSkin,
the must-not-exist profile, the must-not-exist judgement PNG, and the active theme's
`assetsConfig.lua`. Every builder settles before publication begins. Directories and files
share one backup/rollback boundary; new files use atomic hard-link promotion and replacement
files use sibling backups. The prepared asset configuration records either an expected
missing state or the SHA-256 of its exact original bytes, verified after staging and before
any backup. A concurrent configuration edit therefore aborts without changing any target.

## Adding a Conversion Route

1. Add or reuse a source `SkinCatalog` and `SkinReader`.
2. Add or reuse a target `SkinWriter`, or a `SkinInstaller` when the target spans multiple
   owned directories.
3. Implement `SkinConversion` for the exact source-target pair.
4. Register the route in the CLI composition root.
5. Add unit tests for format behavior and a cross-module integration test.
6. Keep source parsing under `adapters/<source>`, target installation under
   `adapters/<target>`, pair-specific equivalences under
   `conversions/<source>-to-<target>`, and generic publication under `infrastructure`.
7. Run both direction integration tests, the architecture test, and the full verification
   commands.

Do not add conditionals for unrelated games inside an existing adapter. A reverse route
should reuse neutral domain concepts while keeping each format's parsing and rendering rules
inside its own adapter.
