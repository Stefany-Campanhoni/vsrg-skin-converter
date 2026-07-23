# Codebase Standardization Design

## Goal

Refactor the project into a strongly standardized, maintainable architecture that preserves
the current CLI behavior and Etterna-to-osu! conversion results while establishing clean
foundations for future conversion directions, especially osu!-to-Etterna.

The refactor may freely move and rename internal modules, types, and imports. Internal API
compatibility is not required. CLI compatibility and conversion behavior are required.

## Scope

This standardization includes:

- reorganizing production code by architectural responsibility;
- replacing the source-oriented `Engine` abstraction with explicit application ports;
- introducing a game-neutral domain model;
- registering conversions by source and target game;
- parsing each Etterna skin into one shared context per conversion;
- making output publication transactional and replacing the previous output in full;
- standardizing naming, module placement, exports, errors, diagnostics, comments, and tests;
- enforcing dependency direction and cycle rules automatically;
- documenting the architecture and mandatory development rules for future contributors and
  agents.

Adding osu!-to-Etterna conversion behavior is outside this refactor. The architecture must
support adding that direction without another structural rewrite.

## Compatibility Requirements

- The CLI continues to discover Etterna skins, ask the user to select one, and convert it to
  osu!.
- Existing Etterna-to-osu! hit-position, receptor, and tap-note behavior remains unchanged.
- Existing template paths and generated osu! filenames remain unchanged.
- Static Lua analysis remains mandatory; Etterna Lua is never executed.
- The final output path remains `output_folder`.
- A successful conversion replaces the entire previous output.
- A failed conversion preserves the previously published output.

## Target Architecture

Production code is organized by responsibility:

```text
src/
  application/
    conversion/
      convert-skin.ts
      conversion-registry.ts
    ports/
      skin-catalog.ts
      skin-reader.ts
      skin-writer.ts

  domain/
    game.ts
    skin.ts
    image.ts
    diagnostics.ts

  adapters/
    etterna/
      catalog/
      profile/
      noteskin/
      reader/
    osu/
      writer/
      templates/

  conversions/
    etterna-to-osu/
      conversion.ts
      hit-position.ts

  infrastructure/
    filesystem/
      file-store.ts
      output-transaction.ts
    image/
      sharp-image-processor.ts
    lua/
      ast.ts
      evaluate-expression.ts

  cli/
    main.ts
    prompts.ts

  config/
    paths.ts
```

The exact number of files may vary when a responsibility is too small to justify its own
module. The layer boundaries and placement rules are mandatory.

### Dependency Direction

```text
CLI ---------> Application ---------> Domain
 |                 ^
 |                 |
 +-> Adapters -----+
 |       |
 |       +---------> Infrastructure
 |
 +-> Conversions --> Domain
 |
 +-> Infrastructure
```

The enforced rules are:

- `domain` imports no project layer and knows nothing about game-specific implementations,
  Lua, Sharp, the CLI, or the filesystem;
- `application` depends on domain models and application ports, not concrete adapters;
- `conversions` depend on the domain and application conversion contract, not adapters or
  infrastructure;
- `adapters` implement application ports and may use infrastructure services;
- `infrastructure` contains technical implementations for filesystem, image processing, and
  Lua AST operations;
- `cli` is the composition root: it collects user input, wires concrete adapters,
  conversions, and infrastructure into the application use case, and presents results;
- no production dependency cycles are allowed.

An architecture test uses the TypeScript AST to inspect imports, enforce these directions,
and detect production-module cycles without adding another parsing dependency.

## Application Ports

Game capabilities are represented by small interfaces rather than one partially implemented
engine:

```ts
interface SkinCatalog {
  listSkins(location: string): Promise<SkinReference[]>
}

interface SkinReader {
  readSkin(reference: SkinReference): Promise<SkinModel>
}

interface SkinConversion {
  source: GameId
  target: GameId
  convert(source: SkinModel): Promise<SkinModel>
}

interface SkinWriter {
  writeSkin(skin: SkinModel, workspace: string): Promise<void>
}
```

The application conversion registry resolves `SkinConversion` by the pair
`{ sourceGame, targetGame }`. Initially, only `etterna -> osu` is registered. The CLI derives
osu! as the available Etterna target, preserving its current interaction flow.

The current `Engine`, `EtternaEngine`, and unimplemented `OsuEngine` abstraction is removed.
Catalog, reader, conversion, and writer responsibilities remain independently testable.

## Domain Model

The domain owns the shared vocabulary:

- `GameId`: supported game identifier;
- `ColumnDirection`: `left`, `down`, `up`, or `right`;
- `SpriteFrame`: frame index, column count, and row count;
- `ImageAsset`: source image reference, optional frame, and rotation;
- `ReceptorSet`: normal and pressed images by direction;
- `TapNoteSet`: tap-note image by direction;
- `SkinMetadata`: game-neutral skin metadata;
- `PlayfieldConfiguration`: positions and layout values needed by conversions;
- `SkinModel`: complete game-neutral representation used between readers, conversions, and
  writers;
- `Diagnostic`: typed non-fatal information with code, severity, component, optional
  direction, and message.

Notes and receptors use the same `ImageAsset` and `SpriteFrame` definitions. Directions do
not belong to receptor-specific modules.

Paths are represented as opaque source references in the domain. Filesystem interpretation
and mutation remain outside the domain.

## Etterna Adapter

The Etterna adapter owns:

- default installation conventions;
- skin discovery under `NoteSkins/dance`;
- profile discovery and 4K gameplay-coordinate parsing;
- `NoteSkin.lua` discovery and static analysis;
- Etterna filename, spritesheet, `.redir`, and element-resolution rules;
- mapping resolved Etterna resources into the neutral `SkinModel`.

One `NoteSkinContext` is created per skin read and passed to both receptor and note analyzers.
It owns the parsed source, indexed files, redirects, rotations, rotation flags, and named
functions. No analyzer reparses or reindexes the same skin.

Reusable Lua AST traversal and safe-expression helpers move to the Lua infrastructure layer.
Etterna-specific interpretations remain in the Etterna adapter.

## Etterna-to-osu! Conversion

The conversion module owns only cross-format equivalences:

- Etterna-to-osu! hit-position conversion;
- any future semantic mapping that belongs to neither format independently;
- validation that the neutral source model contains everything the osu! writer requires.

It does not discover files, parse Lua, process pixels, write output, or interact with the
CLI.

## osu! Adapter

The osu! writer owns:

- osu! template selection and rendering;
- exact `skin.ini` property and wildcard names;
- target paths for receptors and notes;
- output naming and directory conventions;
- coordinating image operations requested by the converted model;
- validating the completed osu! workspace before publication.

The existing receptor canvas rules and dimension-preserving tap-note rules remain unchanged.
Sharp is accessed through an image-processing implementation rather than from application or
domain modules.

## Transactional Output Publication

Each conversion builds a complete result in a temporary sibling of `output_folder` so that
all rename operations remain on the same filesystem.

Publication follows this sequence:

1. create a uniquely named staging directory next to the target;
2. build the complete target skin in staging;
3. validate the staged output;
4. rename the existing output to a uniquely named backup, if it exists;
5. rename staging to `output_folder`;
6. remove the backup after successful promotion.

If promotion fails after the old output was moved, the transaction restores the backup. A
failure before promotion removes staging and leaves the current output untouched.

Target and backup paths are resolved and validated before recursive deletion or movement.
The publisher never performs a recursive operation against a workspace root, drive root,
home directory, or unresolved environment-variable path.

## Errors and Diagnostics

- Recoverable findings use typed `Diagnostic[]`.
- Fatal parsing, validation, conversion, filesystem, image, or publication failures throw
  contextual errors.
- Filesystem functions never catch an error only to log it and continue.
- Errors preserve their cause when wrapping lower-level failures.
- The CLI is the only layer responsible for presenting errors and diagnostics to the user.
- Diagnostic output is component-neutral; note warnings are never labeled as receptor
  warnings.

## Naming and Module Standards

- Files and directories use `kebab-case`.
- Types, interfaces, classes, and error classes use `PascalCase`.
- Functions, variables, and module constants use `camelCase`.
- Named exports are required; default exports are not used.
- Type-only dependencies use `import type`.
- Tuples with `as const` and derived union types are preferred over enums.
- Generic dumping grounds such as `utils`, `helpers`, `common`, `objects`, and `constants`
  are prohibited.
- A constant lives with the responsibility that owns it:
  - universal values in `domain`;
  - runtime defaults and paths in `config`;
  - Etterna conventions in the Etterna adapter;
  - osu! paths and names in the osu! adapter;
  - cross-game equivalences in the relevant conversion module.
- Barrel files are used only for an intentional public module API, never merely to shorten
  imports.
- Modules should expose a focused API and keep implementation details private.
- Comments explain non-obvious reasons, invariants, external constraints, or safety rules.
  Comments do not narrate code that is already clear from names and structure.
- Technical identifiers, filenames, messages, comments, and documentation are written in
  English.

## Testing Standards

- Unit tests are colocated with their modules as `*.test.ts`.
- Cross-module integration tests live under `tests/integration`.
- Dependency and cycle tests live under `tests/architecture`.
- Small purpose-built fixtures are preferred for deterministic unit tests.
- Shared integration fixtures live under `tests/fixtures` and are named for the behavior
  they demonstrate.
- The real skins under `tmp` remain a compatibility-audit corpus and are not coupled to the
  unit test suite.
- Refactoring proceeds in behavior-preserving slices, with focused tests after each move.
- Required verification commands cover tests, type checking, linting, architecture rules,
  whitespace, and the real-skin audit.

## Permanent Documentation

The standardized project documentation consists of:

- `AGENTS.md`: concise mandatory instructions and links for future agents;
- `docs/architecture.md`: layers, ports, dependency rules, domain model, and data flow;
- `docs/development-standards.md`: placement, naming, exports, errors, comments, and tests;
- `README.md`: project purpose, supported conversion, setup, commands, and current structure.

Detailed documents are authoritative. `AGENTS.md` summarizes invariants and links to them
instead of duplicating their full contents.

## Migration Strategy

The refactor is executed in small dependency-ordered slices:

1. establish tests and architecture documentation;
2. create neutral domain models and diagnostics;
3. extract shared Lua AST and image infrastructure;
4. reorganize the Etterna catalog, profile, NoteSkin context, and analyzers;
5. reorganize the osu! template and writer;
6. introduce application ports, registry, and conversion coordinator;
7. migrate the CLI and remove the old engine abstraction;
8. add transactional publication;
9. update permanent documentation and architecture enforcement;
10. run the complete automated and real-skin verification.

Temporary compatibility adapters may exist within an individual migration slice but must be
removed before the refactor is considered complete.

## Acceptance Criteria

- CLI behavior and Etterna-to-osu! output remain compatible.
- All production files follow the target architecture or an explicitly documented exception.
- No generic constants, utilities, objects, helpers, or common dumping-ground modules remain.
- No duplicated direction, frame, or image-asset models remain.
- Etterna parsing creates one shared context per conversion.
- Conversion selection is keyed by source and target game.
- Output replacement is complete, transactional, and rollback-safe.
- Fatal I/O failures propagate instead of being logged and ignored.
- Diagnostics are typed and correctly labeled.
- Architecture direction and cycle checks are automated.
- Tests, typecheck, lint, architecture checks, whitespace checks, and the real-skin audit pass.
- `AGENTS.md`, architecture documentation, development standards, and README describe the
  final implementation accurately.
