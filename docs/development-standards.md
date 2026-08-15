# Development Standards

These rules are mandatory for production code, tests, documentation, and agent-authored
changes.

## Placement

Place code with the responsibility that owns it:

- universal vocabulary and invariants: `src/domain`;
- use-case coordination and interfaces, including installer and publication ports:
  `src/application`;
- one game's parsing, output, profile, or installation conventions: `src/adapters/<game>`;
- cross-game equivalences: `src/conversions/<source>-to-<target>`;
- technical filesystem, image, or language mechanisms: `src/infrastructure`;
- runtime defaults and composition paths: `src/config`;
- command-line interaction and wiring: `src/cli`;
- CI and release automation: `.ci`;
- cross-layer integration tests: `tests/integration`;
- portable artifact tests and real Windows smoke checks: `tests/distribution`;
- dependency enforcement: `tests/architecture`.

Do not create generic dumping grounds named `utils`, `helpers`, `common`, `objects`, or
`constants`. If a module has no clear owner, identify the responsibility before adding it.

Constants stay with their owner. For example, an osu! output filename belongs to the osu!
adapter, while an Etterna-to-osu! coordinate equivalence belongs to that conversion.
Configuration modules export runtime paths and installation defaults only. They must not
enumerate a target template at module initialization; exact target asset inventories belong
to the corresponding target adapter.

## Naming and Modules

- Files and directories use `kebab-case`.
- Types, interfaces, and classes use `PascalCase`.
- Functions, variables, and constants use `camelCase`.
- Use named exports; do not add default exports.
- Use `import type` for type-only dependencies.
- Prefer readonly data, `as const` tuples, and derived union types over enums.
- Keep a module focused and keep implementation details private.
- Add a barrel file only when a package deliberately exposes a stable public surface.

Technical identifiers, filenames, diagnostics, errors, comments, and documentation are
written in English.

## Dependencies

Respect the direction documented in [architecture.md](./architecture.md). Do not bypass an
application port by importing a concrete adapter into the application layer. Do not place
format-specific knowledge in the domain or shared infrastructure.

Run `npm run test:architecture` whenever imports or module placement change.

## Errors and Diagnostics

Throw an error when the conversion cannot produce a valid complete target. Wrap lower-level
failures with actionable context and preserve the original error with `cause`.

Use `Diagnostic` for recoverable findings. Diagnostics must have a stable code, severity,
responsible component, optional direction, and useful message. Libraries and adapters do
not print errors or diagnostics; only the CLI presents them.

Never catch a filesystem or image-processing error only to log it and continue.

When a lower-level decoder is used to answer a semantic question, such as whether an image
is transparent, decoding failures remain errors. Do not reinterpret an unreadable image as
a valid visible or transparent asset.

Concurrent batches are quiescent: once work has started, the caller waits for every sibling
to settle before returning or throwing. Apply this rule at every nested batch boundary; a
fail-fast `Promise.all` inside `settleAll` still leaves orphan work. Wrap injected callbacks
with `invokeAsPromise` before collecting them so a synchronous throw becomes a rejected task
and cannot prevent later siblings from starting.

## Comments

Prefer descriptive names and small functions. Add a comment only when it explains:

- a non-obvious invariant;
- an external format constraint;
- a safety boundary;
- why an apparently simpler implementation is incorrect.

Do not narrate what the following code already states.

## Testing

- Colocate unit tests as `*.test.ts`.
- Put cross-module behavior in `tests/integration`.
- Put dependency rules in `tests/architecture`.
- Use small generated fixtures for deterministic tests.
- Use valid encoded image buffers in image-facing tests. Invalid bytes are appropriate only
  when the behavior under test is decoder failure.
- Keep real skins under `tmp` as a compatibility-audit corpus, not as unit-test fixtures.
- For a behavior change, write or update a failing test before production code.
- Test public outcomes and important failure behavior, not private implementation details.

Every completed change must pass:

```sh
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
```

Release changes additionally require:

```sh
npm run build:windows
npm run test:distribution
npm run release:windows
```

Never commit `build`, `release`, or `.cache/release` contents. Inspect the final ZIP manifest
and checksum even when unit tests pass.

Changes to Etterna analysis or image conversion also require a compatibility audit against
the applicable real skins under `tmp`.

Changes to either route require its integration test. Changes to shared domain,
infrastructure, CLI dispatch, or installation discovery require both direction integration
tests so the Etterna-to-osu! route cannot regress while the reverse route evolves.

## Versioning and Release Automation

Changesets owns SemVer intent and `CHANGELOG.md`. Every ordinary pull request adds one new
`.changeset/*.md` document. Use a real `patch`, `minor`, or `major` entry for a public change
and `npm run changeset -- --empty` for maintenance-only work. Only the automated
`changeset-release/main` branch may omit a new changeset because its job is to consume the
pending set.

All commits and pull request titles follow the configured Conventional Commit types. The
local `commit-msg` hook gives immediate feedback, while CI remains authoritative and checks
the complete pull request range plus the squash title. Do not weaken either check for bots;
configure automated dependency commit prefixes to use an allowed type instead.

The Changesets Action is pinned by full SHA and its major version must remain compatible
with the installed Changesets CLI major. It receives only the dedicated `CHANGESETS_TOKEN`
through the action's `github-token` input. That fine-grained token requires read/write
contents and pull-request access. The action may maintain the Release PR but must never
publish the npm package, create release tags, or bypass protected-branch review. Keep
`package.json` private and `privatePackages.version` enabled with `privatePackages.tag`
disabled.

The draft release workflow may publish only when `package.json` and the lockfile contain the
same valid SemVer, that version is greater than the previous `main` version, and
`CHANGELOG.md` contains its exact release heading. Ordinary pushes are successful no-ops.
The release job runs the complete Windows release gate before creating a new immutable-name
tag and draft; it must refuse to overwrite an existing tag. Prerelease SemVer values add the
GitHub prerelease flag automatically.

Changesets prerelease mode is a repository state, not a local convenience. Enter or exit
`beta` only through a reviewed pull request. While `.changeset/pre.json` is active, `main`
has one beta release train and stable publication waits until the exit PR is merged. With
Changesets CLI v3, `pre.json` contains only the mode and tag; already-versioned prerelease
entries belong under `.changeset/pre` and must not be reconstructed in the root state file.

Place repository validation, build, and release automation under `.ci`, grouped by purpose.
The programs in `.ci/release` remain supported for local execution through npm scripts.
Tests may import pure functions from `.ci`, but production modules must not depend on that
directory.

For receptor rendering, tests must preserve this processing order: extract the selected
frame, rotate it, normalize its size, apply target-specific vertical scaling, trim trailing
transparent rows, and compose the final canvas. Reordering these operations changes the
meaning of dimensions and frame orientation.

Generic pixel inspection and Sharp operations belong in image infrastructure. A target
writer owns target-format fallback policy; for example, the osu! writer may replace an empty
pressed receptor with its normal counterpart, but infrastructure must not encode that rule.

## Output and Safety

Each target writer builds a complete workspace. A single-directory output uses
`TransactionalOutputPublisher`. A target that owns multiple independent directories uses an
application `OutputSetPublisher` port and infrastructure implementation; it must build and
settle every workspace before changing any target and must roll all targets back together.
Writers must not depend on files from an earlier conversion.

Never execute skin-provided Lua. Use the static AST and conservative resolution rules. An
unsupported construct should produce a diagnostic or contextual failure according to
whether a valid target can still be generated.

Validate externally derived directory names before composing paths. A selected profile ID,
theme name, output skin name, or similar segment must remain exactly one directory level
under its owning root; centralize repeated format-specific path rules in the responsible
adapter or runtime-path configuration module.

Do not weaken target-path validation or replace transactional publication with direct
recursive deletion.

Release scripts may clean only absolute, validated descendants of their controlled build,
cache, and release roots. Preserve the last complete unpacked package and ZIP/checksum pair
until a staged replacement passes structural, launcher, template, and real Sharp checks.
Pin redistributed runtimes by exact version and official checksum. Keep Sharp external to
the application bundle, copy only its proven Windows x64 dependency closure, retain required
licenses, and reject TypeScript, tests, maps, caches, links, npm shims, and wasm artifacts.
Runtime resource resolution must derive from `import.meta.url`, never `process.cwd()`.
An extracted runtime cache is trusted only when a checked stamp binds it to the pinned archive
SHA-256, pinned executable SHA-256, configured version, and a successful matching
`node --version`. Missing or mismatched evidence requires re-extraction. Release functions
that remove, replace, or promote paths must receive an explicit controlled root, validate all
derived transaction paths before callbacks or mutations, and retain recovery backups when a
rollback cannot complete.

Overwrite approval is an interaction concern. The CLI must identify the exact selected
target, ask for explicit confirmation, and cancel before allocation or publication when the
answer is false or cancelled. The installer receives the expected selected name and a
separate overwrite policy, verifies the name again, and never prompts.

For osu! sources, keep ordered INI parsing, CFG interpretation, and PNG path resolution in
`adapters/osu`. Density is explicit model data: explicit `@2x` wins; otherwise resolutions
above `1280x720` select only `@2x`, and standard resolutions select only unsuffixed PNGs.
Never add density fallback silently, and never use the selected source density to vary target
filenames or dimensions. Keep inverse osu!-to-Etterna coordinate/width formulas in
`conversions/osu-to-etterna`, generic receptor normalization in image infrastructure,
Etterna filenames, dimensions, fallback policy, and future output calibrations in
`adapters/etterna`, and multi-target publication in filesystem infrastructure.

The reverse target contract is fixed: notes use the four direction-specific ` (res 64x64)`
names at exactly 150x150, and normal/pressed receptors use the eight direction/state-specific
` (res 64x64)` names at exactly 146x146. Receptor processing order is vertical transparent-row
trim, source-width square, then exact 146x146 resize. A fully transparent normal remains
transparent; a fully transparent pressed receptor falls back to the processed normal from
the same direction. Integration tests must assert the exact inventories, dimensions, and
lane/state source pixels, and every route asset change must run both direction integration
tests.

Reverse judgement migration must resolve all six Mania grades at one common source density
and preserve this row order: marvelous, perfect, great, good, bad, miss. Do not resize,
trim, crop, or rotate these images. Center unequal images in transparent maximum-size cells;
standard density names the result `1x6.png`, while double density uses
`1x6 (Doubleres).png`. Treat the generated PNG and active-theme `assetsConfig.lua` update as
members of the same mixed file/directory transaction as the NoteSkin and profile. Preserve
unrelated Lua tokens and guard replacement with the exact original-content SHA-256.
