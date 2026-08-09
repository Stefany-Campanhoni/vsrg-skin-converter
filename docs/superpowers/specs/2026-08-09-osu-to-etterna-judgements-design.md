# osu! to Etterna Judgement Migration Design

## Goal

Extend only the osu!-to-Etterna conversion so a converted profile automatically uses a
generated Etterna judgement sheet. The existing Etterna-to-osu! route must retain its current
behavior.

This feature migrates judgement images only. It does not migrate `JudgmentZoom`; the fixed
value owned by the Etterna profile template remains unchanged.

## Source Mapping

The unique 4K `[Mania]` section in `skin.ini` supplies the six source references:

| osu! property | Domain grade | Etterna row |
| --- | --- | --- |
| `Hit300g` | `marvelous` | 0 |
| `Hit300` | `perfect` | 1 |
| `Hit200` | `great` | 2 |
| `Hit100` | `good` | 3 |
| `Hit50` | `bad` | 4 |
| `Hit0` | `miss` | 5 |

The osu! reader resolves these paths with the existing PNG density policy:

- an explicit `@2x` reference always selects the explicit `@2x` asset;
- an implicit reference uses the selected osu! user configuration and active resolution;
- when both physical variants exist, only the variant selected by those rules is used;
- unsupported extensions, unsafe paths, missing files, and ambiguous physical matches retain
  the existing resolver failures.

All six selected images must have one common density. A mixed standard/double set is rejected
because one Etterna sheet cannot describe per-row density. A standard set produces
`sourceDensity: 1`; a double set produces `sourceDensity: 2`.

## Domain Boundary

The existing `JudgementSet` and canonical `judgementGrades` order are reused. osu!-specific
`Hit*` names remain in the osu! adapter, while Etterna sheet layout and filename conventions
remain in the Etterna adapter. Generic image infrastructure does not interpret either game's
semantic names.

The reverse conversion preserves the resolved judgement assets through the format-neutral
skin model. Existing receptors, tap notes, playfield values, diagnostics, and neutral scale
values are unchanged.

## Sheet Composition

A dedicated Etterna judgement composer receives the six resolved images in canonical domain
order and performs these steps:

1. Read and decode all six PNG images through a quiescent `settleAll` batch.
2. Determine the maximum decoded width and maximum decoded height.
3. Create one transparent cell with those dimensions for each grade.
4. Center each source image horizontally and vertically in its cell without scaling,
   trimming, cropping, or rotation.
5. Stack the cells vertically in the order `marvelous`, `perfect`, `great`, `good`, `bad`,
   `miss`.
6. Encode one PNG whose width is the maximum source width and whose height is six times the
   maximum source height.

The composer preserves RGBA pixels and transparent padding. It reports source-grade and path
context while retaining the exact decode/composition failure as its cause. All started sibling
operations settle before the first input-order failure is propagated.

## Output Naming and Placement

The generated sheet is a direct child of `<Etterna>/Assets/Judgments` and uses the allocated
profile GUID to avoid overwriting earlier conversions:

- standard: `<skin name> - <guid> 1x6.png`;
- double: `<skin name> - <guid> 1x6 (Doubleres).png`.

The existing safe NoteSkin name contract and the allocated lower-case 16-hex-character GUID
are required before deriving the filename. The generated `assetsConfig.lua` value uses a
forward-slash relative path such as
`Assets/Judgments/My Skin - 0123456789abcdef 1x6.png`.

## assetsConfig.lua Update

The selected Etterna theme determines the configuration path:

`<Etterna>/Save/<theme>_settings/assetsConfig.lua`

An Etterna-only editor handles the file:

- If the file is absent, create a minimal valid Lua return table containing the new
  `judgment[guid]` mapping.
- If a top-level returned table and a `judgment` table exist, insert only the new GUID entry.
- If the top-level returned table exists without `judgment`, insert a new `judgment` table.
- Preserve existing `avatar`, `toasty`, `default`, and other fields, comments, whitespace, and
  text except for the required insertion.
- Serialize the GUID as a bracketed Lua string key and escape the relative path as a Lua string
  literal.
- Reject malformed Lua, an incompatible top-level structure, a non-table `judgment` value, or
  an existing mapping for the allocated GUID.

Configuration parsing never executes Lua. Parsing uses source ranges so the adapter can make a
minimal textual insertion and then reparses the result before publication.

## Transactional Publication

The output-set publisher is generalized to accept a discriminated union of directory and file
targets. Existing directory callers retain their current behavior. File targets receive an
isolated staging file and participate in the same safety model:

- lexical and physical containment validation;
- duplicate and overlapping target rejection;
- `must-not-exist` and `replace-existing` policies;
- staging, backup, promotion, rollback, and cleanup;
- preservation and reporting of recovery artifacts if rollback cannot complete;
- no silent replacement of a concurrently created `must-not-exist` file;
- an optional expected-content fingerprint for a replaceable file, checked immediately before
  backup/promotion so an external `assetsConfig.lua` edit aborts the transaction instead of
  being overwritten.

The Etterna installer allocates the new profile identity before deriving judgement outputs and
publishes four targets in one transaction:

1. the NoteSkin directory;
2. the new profile directory;
3. the unique judgement PNG file;
4. the theme `assetsConfig.lua` file.

The `assetsConfig.lua` build reads and edits the current source configuration and records its
content fingerprint. The publisher verifies that fingerprint again immediately before changing
the target. Any build, concurrent-change check, or promotion failure rolls back every promoted
target, so no profile can point to a missing judgement and no generated judgement remains
orphaned after a failed install.

## Failure Contract

The conversion fails before publication when:

- a required `Hit*` property is absent;
- a selected reference is unsafe, missing, ambiguous, or not PNG;
- selected judgement densities are mixed;
- a judgement PNG cannot be decoded or composed;
- the output filename or relative configuration path is unsafe;
- `assetsConfig.lua` is malformed or structurally incompatible;
- the new GUID is already mapped;
- any transactional safety, build, promotion, rollback, or cleanup operation fails.

Errors add adapter and target context and preserve the exact lower-level cause. Preparation and
write batches remain quiescent: every started sibling settles before rejection, and no write
phase begins after preparation failure.

## Concurrency With Other Repository Work

Implementation occurs in the current dirty worktree because it depends on uncommitted reverse
conversion code. Before editing an existing shared file, compare it with the state observed
during this design. Incorporate concurrent changes narrowly with patches; never reset, check
out, or replace the other agent's work. New modules are preferred where a clean boundary exists.
The manual `trim-osu-receptor` script remains outside this feature and its command is not run.

## Test Strategy

Tests must cover:

- 4K `Hit*` parsing and canonical semantic mapping;
- existing explicit and implicit SD/HD selection rules for all six judgements;
- mixed-density rejection after every started resolution settles;
- centered transparent padding with unequal source dimensions;
- exact row order, output dimensions, RGBA preservation, and density decoration;
- missing, malformed, structurally incompatible, and existing-GUID `assetsConfig.lua` cases;
- minimal insertion that preserves unrelated configuration text and reparses successfully;
- file-target containment, collision handling, promotion, rollback, and cleanup alongside
  existing directory targets, including optimistic rejection of a concurrent file edit;
- one atomic Etterna installation containing NoteSkin, profile, judgement sheet, and updated
  configuration;
- end-to-end pixel and GUID/path assertions for osu!-to-Etterna;
- the complete Etterna-to-osu! integration path as a non-regression gate;
- current documentation describing migrated judgements while keeping judgement zoom excluded.

The full test, typecheck, strict TypeScript, lint, architecture, and diff-check gates must pass.
Platform-specific filesystem cases may remain explicitly skipped only for the same documented
Windows capability limitations as the existing publisher tests.
