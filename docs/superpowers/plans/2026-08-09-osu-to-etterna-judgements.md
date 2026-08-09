# osu! to Etterna Judgement Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the six osu!mania judgement PNGs, compose the Etterna `1x6` sheet, and atomically install it with the new profile and its `assetsConfig.lua` mapping.

**Architecture:** The osu! adapter maps `Hit*` properties into the existing format-neutral `JudgementSet`; generic Sharp infrastructure composes centered equal-size cells; Etterna adapters own the sheet name and Lua mapping. The output-set publisher gains explicit file targets so NoteSkin, profile, sheet, and configuration share one rollback-capable transaction.

**Tech Stack:** TypeScript, Node.js test runner, Sharp, luaparse, Node.js filesystem/crypto APIs, Biome.

## Global Constraints

- Change only osu!-to-Etterna judgement migration; Etterna-to-osu! behavior must remain unchanged.
- Preserve source pixels: no judgement scaling, trimming, cropping, or rotation.
- Center every source in a transparent cell sized to the maximum source width and height.
- Row order is exactly `marvelous`, `perfect`, `great`, `good`, `bad`, `miss`.
- Use the existing osu! density resolver; standard and double assets cannot be mixed in one sheet.
- Standard output ends in `1x6.png`; double output ends in `1x6 (Doubleres).png`.
- Keep `JudgmentZoom` fixed in the profile template; do not migrate judgement zoom.
- Preserve existing `assetsConfig.lua` content except for the required mapping insertion.
- Publish NoteSkin, profile, judgement PNG, and `assetsConfig.lua` atomically.
- Before editing any existing file, inspect its current diff because another agent is working in the same worktree. Incorporate concurrent edits; never reset, checkout, or replace them.
- Do not run `npm run test:trim-osu-receptor` or modify the manual trim script.
- Do not stage or commit; the user is reviewing the shared dirty worktree in the IDE.

---

### Task 1: Parse the Six osu! Judgement References

**Files:**
- Modify: `src/adapters/osu/skin-ini/osu-skin-ini.ts`
- Modify: `src/adapters/osu/skin-ini/osu-skin-ini.test.ts`

**Interfaces:**
- Consumes: the unique parsed 4K Mania section.
- Produces: `OsuMania4kDefinition.judgements: Readonly<Record<JudgementGrade, string>>`.

- [ ] **Step 1: Check for concurrent edits**

Run:

```powershell
git diff -- src/adapters/osu/skin-ini/osu-skin-ini.ts src/adapters/osu/skin-ini/osu-skin-ini.test.ts
```

Record the observed hunks and preserve any later changes not made by this task.

- [ ] **Step 2: Add failing parser tests**

Add a complete 4K fixture containing these values and assert the canonical mapping:

```ts
assert.deepEqual(definition.judgements, {
  marvelous: "mania\\judgements\\marvelous",
  perfect: "mania\\judgements\\perfect",
  great: "mania\\judgements\\great",
  good: "mania\\judgements\\good",
  bad: "mania\\judgements\\bad",
  miss: "mania\\judgements\\miss",
})
```

Add one table-driven test deleting each of `Hit300g`, `Hit300`, `Hit200`, `Hit100`, `Hit50`, and
`Hit0`; every case must reject with the missing property and `skin.ini` path.

- [ ] **Step 3: Run the focused test and observe RED**

Run:

```powershell
node --test src/adapters/osu/skin-ini/osu-skin-ini.test.ts
```

Expected: failures because `judgements` is absent and missing `Hit*` values are not required.

- [ ] **Step 4: Implement the semantic mapping**

Import `JudgementGrade` and extend the definition:

```ts
readonly judgements: Readonly<Record<JudgementGrade, string>>
```

Build it explicitly in `readOsuMania4kDefinition`:

```ts
judgements: {
  marvelous: requiredProperty(properties, "hit300g", filePath),
  perfect: requiredProperty(properties, "hit300", filePath),
  great: requiredProperty(properties, "hit200", filePath),
  good: requiredProperty(properties, "hit100", filePath),
  bad: requiredProperty(properties, "hit50", filePath),
  miss: requiredProperty(properties, "hit0", filePath),
},
```

- [ ] **Step 5: Verify GREEN and local quality**

Run:

```powershell
node --test src/adapters/osu/skin-ini/osu-skin-ini.test.ts
npx @biomejs/biome check src/adapters/osu/skin-ini/osu-skin-ini.ts src/adapters/osu/skin-ini/osu-skin-ini.test.ts
npm run typecheck
```

Expected: all exit 0.

---

### Task 2: Resolve Judgements Into the Domain Model

**Files:**
- Modify: `src/adapters/osu/reader/osu-skin-reader.ts`
- Modify: `src/adapters/osu/reader/osu-skin-reader.test.ts`

**Interfaces:**
- Consumes: `OsuMania4kDefinition.judgements` from Task 1 and `resolveOsuPngAsset`.
- Produces: `SkinModel.assets.judgements: JudgementSet` with `sourceDensity: 1 | 2`.

- [ ] **Step 1: Check for concurrent edits**

```powershell
git diff -- src/adapters/osu/reader/osu-skin-reader.ts src/adapters/osu/reader/osu-skin-reader.test.ts
```

- [ ] **Step 2: Add failing reader tests**

Extend the test Mania definition with six distinct logical paths. Capture every resolver call and
assert the existing density flag reaches all six. Return assets with grade-specific file paths
and one common density, then assert:

```ts
assert.deepEqual(model.assets.judgements, {
  sourceDensity: 2,
  images: {
    marvelous: resolved["marvelous"],
    perfect: resolved["perfect"],
    great: resolved["great"],
    good: resolved["good"],
    bad: resolved["bad"],
    miss: resolved["miss"],
  },
})
```

Add tests that:

- reject one standard asset among double assets with a `mixed judgement densities` message;
- reject a missing `pixelDensity` with grade/path context;
- start and settle all six judgement resolutions when an earlier resolver fails;
- retain the exact resolver failure as `cause`.

- [ ] **Step 3: Run the reader tests and observe RED**

```powershell
node --test src/adapters/osu/reader/osu-skin-reader.test.ts
```

Expected: the returned model has no judgements and the new resolver calls are absent.

- [ ] **Step 4: Resolve in canonical order**

Use `judgementGrades` to append typed reference descriptors after receptors and notes. Convert the
six resolved `pixelDensity` values only after the quiescent resolution batch:

```ts
function getJudgementSourceDensity(images: readonly ImageAsset[]): 1 | 2 {
  const densities = new Set(images.map((image) => image.pixelDensity))
  if (densities.size !== 1 || densities.has(undefined)) {
    throw new Error("osu judgement assets have mixed or missing pixel densities")
  }
  return densities.has("double") ? 2 : 1
}
```

Build the `Record<JudgementGrade, ImageAsset>` explicitly from the ordered results and include it
under `assets.judgements`. Do not change playfield values or other assets.

- [ ] **Step 5: Verify GREEN and both reader directions**

```powershell
node --test src/adapters/osu/reader/osu-skin-reader.test.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts
npx @biomejs/biome check src/adapters/osu/reader/osu-skin-reader.ts src/adapters/osu/reader/osu-skin-reader.test.ts
npm run typecheck
```

Expected: all exit 0.

---

### Task 3: Compose and Name the Etterna Judgement Sheet

**Files:**
- Create: `src/infrastructure/image/compose-centered-vertical-sprite-sheet.ts`
- Create: `src/infrastructure/image/compose-centered-vertical-sprite-sheet.test.ts`
- Create: `src/adapters/etterna/judgements/etterna-judgement-output.ts`
- Create: `src/adapters/etterna/judgements/etterna-judgement-output.test.ts`
- Create: `src/adapters/etterna/writer/etterna-judgement-writer.ts`
- Create: `src/adapters/etterna/writer/etterna-judgement-writer.test.ts`
- Modify: `src/adapters/etterna/settings/etterna-settings-paths.ts`
- Modify: `src/adapters/etterna/settings/etterna-settings-paths.test.ts`

**Interfaces:**
- Consumes: `JudgementSet`, safe skin name, profile GUID, and a staging file path.
- Produces:
  - `composeCenteredVerticalSpriteSheet(frames: readonly CenteredSpriteSheetFrame[]): Promise<Buffer>`;
  - `getEtternaJudgementFilename(skinName: string, guid: string, sourceDensity: 1 | 2): string`;
  - `getEtternaJudgementRelativePath(filename: string): string`;
  - `EtternaJudgementWriter.writeJudgement(skin: SkinModel, outputFile: string): Promise<void>`;
  - `resolveEtternaJudgmentsPath(gameRoot: string): string`;
  - `resolveEtternaJudgementPath(gameRoot: string, filename: string): string`.

- [ ] **Step 1: Check shared path files for concurrent edits**

```powershell
git diff -- src/adapters/etterna/settings/etterna-settings-paths.ts src/adapters/etterna/settings/etterna-settings-paths.test.ts
```

- [ ] **Step 2: Add failing generic compositor tests**

Create six `CenteredSpriteSheetFrame` values with unequal RGBA PNG dimensions, unique labels, and
unique solid colors. Assert the output metadata
uses the maximum cell dimensions:

```ts
assert.deepEqual(
  { width: info.width, height: info.height },
  { width: maxWidth, height: maxHeight * 6 },
)
```

Read raw output pixels and assert each source is centered using:

```ts
const left = Math.floor((maxWidth - sourceWidth) / 2)
const top = row * maxHeight + Math.floor((maxHeight - sourceHeight) / 2)
```

Assert padding alpha is zero, source RGBA is unchanged, input order is retained, an empty input is
rejected, labels appear in contextual decode errors, exact causes are retained, and all started
decodes settle before the first input-order error is thrown.

- [ ] **Step 3: Implement the generic compositor**

Define the generic input without game-specific semantics:

```ts
export interface CenteredSpriteSheetFrame {
  readonly label: string
  readonly image: Buffer
}
```

Decode each `frame.image` with
`sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })` inside `settleAll`.
Create one transparent four-channel canvas and composite raw inputs at the calculated offsets.
Encode as PNG. Wrap decode failures with frame index, caller label, and exact cause; reject zero
frames before invoking Sharp.

- [ ] **Step 4: Add failing Etterna naming/path tests**

Assert exact results:

```ts
assert.equal(
  getEtternaJudgementFilename("Fixture", "0123456789abcdef", 1),
  "Fixture - 0123456789abcdef 1x6.png",
)
assert.equal(
  getEtternaJudgementFilename("Fixture", "0123456789abcdef", 2),
  "Fixture - 0123456789abcdef 1x6 (Doubleres).png",
)
assert.equal(
  getEtternaJudgementRelativePath(filename),
  `Assets/Judgments/${filename}`,
)
```

Reject invalid GUIDs and unsafe filename segments. Test that resolved absolute paths remain direct
children of `<gameRoot>/Assets/Judgments`.

- [ ] **Step 5: Implement Etterna output policy and paths**

Keep filename construction under `adapters/etterna/judgements`. Reuse/export the existing safe
Etterna segment validation instead of duplicating Windows device-name and invalid-character
rules. Use `path.posix.join` only for the Lua relative path and native `path.join` for disk paths.

- [ ] **Step 6: Add failing writer tests**

Build a `JudgementSet` with six source files and assert reads happen in `judgementGrades` order,
the compositor receives that buffer order, and the exact composed buffer is written to the
provided staging file. Cover non-Etterna models, absent judgements, contextual read/compose/write
errors, exact causes, and quiescent sibling reads.

- [ ] **Step 7: Implement `EtternaJudgementWriter`**

The class must have no naming or installation responsibility:

```ts
export class EtternaJudgementWriter {
  async writeJudgement(skin: SkinModel, outputFile: string): Promise<void>
}
```

Validate `skin.game === "etterna"` and `skin.assets.judgements`. Read all six files through
`settleAll`, then compose frames labeled with their grade and source path, and write once.

- [ ] **Step 8: Verify the complete task**

```powershell
node --test src/infrastructure/image/compose-centered-vertical-sprite-sheet.test.ts src/adapters/etterna/judgements/etterna-judgement-output.test.ts src/adapters/etterna/writer/etterna-judgement-writer.test.ts src/adapters/etterna/settings/etterna-settings-paths.test.ts
npx @biomejs/biome check src/infrastructure/image/compose-centered-vertical-sprite-sheet.ts src/infrastructure/image/compose-centered-vertical-sprite-sheet.test.ts src/adapters/etterna/judgements/etterna-judgement-output.ts src/adapters/etterna/judgements/etterna-judgement-output.test.ts src/adapters/etterna/writer/etterna-judgement-writer.ts src/adapters/etterna/writer/etterna-judgement-writer.test.ts src/adapters/etterna/settings/etterna-settings-paths.ts src/adapters/etterna/settings/etterna-settings-paths.test.ts
npm run typecheck
```

Expected: all exit 0.

---

### Task 4: Render a Minimal Safe assetsConfig.lua Update

**Files:**
- Create: `src/application/ports/file-content-expectation.ts`
- Create: `src/adapters/etterna/assets/prepare-etterna-assets-config-update.ts`
- Create: `src/adapters/etterna/assets/prepare-etterna-assets-config-update.test.ts`
- Create: `src/infrastructure/lua/parse-lua-source.ts`
- Create: `src/infrastructure/lua/parse-lua-source.test.ts`

**Interfaces:**
- Consumes: absolute configuration path, allocated GUID, relative judgement path, and an injected
  file reader/writer for tests.
- Produces:

```ts
export interface PreparedEtternaAssetsConfigUpdate {
  readonly content: string
  readonly expectation: FileContentExpectation
}

export function prepareEtternaAssetsConfigUpdate(
  filePath: string,
  guid: string,
  judgementPath: string,
): Promise<PreparedEtternaAssetsConfigUpdate>

export function writeEtternaAssetsConfigUpdate(
  outputFile: string,
  update: PreparedEtternaAssetsConfigUpdate,
): Promise<void>
```

`FileContentExpectation` lives in the application port, not the Etterna adapter, so the generic
publisher can consume it without an infrastructure-to-adapter dependency:

```ts
export type FileContentExpectation =
  | { readonly state: "missing" }
  | { readonly state: "sha256"; readonly sha256: string }
```

- [ ] **Step 1: Add failing source-parser tests**

Add `parseLuaSource(source, { ranges: true })` so adapters can parse text without temporary files.
Assert ranges exist on a returned table and malformed source preserves the luaparse error.

- [ ] **Step 2: Implement `parseLuaSource` and delegate file parsing**

```ts
export function parseLuaSource(source: string, options: { ranges?: boolean } = {}): Chunk {
  return luaparse.parse(source, { ranges: options.ranges ?? false })
}
```

Refactor `parseLuaFile` to read the file and delegate to `parseLuaSource`, keeping its public
behavior unchanged.

- [ ] **Step 3: Add failing assetsConfig update tests**

Cover these exact cases:

- missing file creates `return { judgment = { ["guid"] = "path" } }`;
- existing `judgment` table receives one new bracketed key;
- a missing `judgment` field is inserted in the top-level returned table;
- `avatar`, `toasty`, defaults, comments, and unrelated whitespace remain byte-identical;
- an empty table and a table with a trailing comma both remain valid;
- quotes, backslashes, newline, carriage return, tab, and control bytes are safely escaped;
- malformed source, multiple/incompatible return values, non-table `judgment`, and duplicate GUID
  reject with file/GUID context;
- the returned content reparses with ranges enabled;
- expectation is `{ state: "missing" }` for ENOENT and SHA-256 of the exact original bytes when
  the file exists;
- non-ENOENT read errors retain their exact cause.

Also assert `writeEtternaAssetsConfigUpdate` writes the exact prepared UTF-8 content to the
provided staging file and preserves the exact write failure as its cause.

- [ ] **Step 4: Implement minimal AST-range insertion**

Parse one top-level `return <table>` with ranges. Locate the last semantic `judgment` field using
existing AST helpers. Insert the new bracketed GUID entry immediately after the selected table's
opening brace and terminate the inserted entry with a comma; this is valid for empty, populated,
commented, and trailing-comma tables without rewriting existing tokens. If `judgment` is absent,
insert a complete `judgment = { ... },` field immediately after the root table's opening brace.
Reparse the rendered source before returning it.

Use a focused Lua literal encoder:

```ts
function encodeLuaString(value: string): string {
  return `"${value.replace(/[\\"\n\r\t\0-\x1f]/g, escapeLuaCharacter)}"`
}
```

The real implementation must map every matched character deterministically and never emit a raw
line break inside the literal.

- [ ] **Step 5: Verify the task and existing Lua readers**

```powershell
node --test src/infrastructure/lua/parse-lua-source.test.ts src/infrastructure/lua/parse-lua-file.test.ts src/adapters/etterna/assets/prepare-etterna-assets-config-update.test.ts src/adapters/etterna/assets/read-etterna-judgement-selection.test.ts
npx @biomejs/biome check src/application/ports/file-content-expectation.ts src/infrastructure/lua/parse-lua-source.ts src/infrastructure/lua/parse-lua-source.test.ts src/adapters/etterna/assets/prepare-etterna-assets-config-update.ts src/adapters/etterna/assets/prepare-etterna-assets-config-update.test.ts
npm run typecheck
```

Expected: all exit 0.

---

### Task 5: Generalize Transactional Publication to File Targets

**Files:**
- Modify: `src/application/ports/output-set-publisher.ts`
- Modify: `src/infrastructure/filesystem/transactional-output-set-publisher.ts`
- Modify: `src/infrastructure/filesystem/transactional-output-set-publisher.test.ts`
- Modify: `src/adapters/etterna/install/etterna-skin-installer.ts`
- Modify: `src/adapters/etterna/install/etterna-skin-installer.test.ts`

**Interfaces:**
- Consumes: existing directory targets plus `FileContentExpectation` from the application port
  created in Task 4.
- Produces:

```ts
interface OutputTargetBase {
  readonly targetPath: string
  readonly allowedRoot: string
  readonly policy: OutputTargetPolicy
}

export interface OutputDirectoryTarget extends OutputTargetBase {
  readonly kind: "directory"
  readonly build: OutputBuilder
}

export interface OutputFileTarget extends OutputTargetBase {
  readonly kind: "file"
  readonly expectedContent?: FileContentExpectation
  readonly build: (stagingFile: string) => Promise<void>
}

export type OutputSetTarget = OutputDirectoryTarget | OutputFileTarget
```

- [ ] **Step 1: Check every shared publisher/installer file for concurrent edits**

```powershell
git diff -- src/application/ports/output-set-publisher.ts src/infrastructure/filesystem/transactional-output-set-publisher.ts src/infrastructure/filesystem/transactional-output-set-publisher.test.ts src/adapters/etterna/install/etterna-skin-installer.ts src/adapters/etterna/install/etterna-skin-installer.test.ts
```

If any hunk appeared after this plan was written, incorporate it before changing the file.

- [ ] **Step 2: Define the union and convert existing callers to directory targets**

Add the exact `OutputTargetBase`, `OutputDirectoryTarget`, `OutputFileTarget`, and
`OutputSetTarget` definitions above to the application port. Then mechanically replace
`targetDirectory` with `kind: "directory", targetPath` in the publisher test helper and current
Etterna installer targets. Run the existing suite before adding file behavior:

```powershell
node --test src/infrastructure/filesystem/transactional-output-set-publisher.test.ts src/adapters/etterna/install/etterna-skin-installer.test.ts
```

Expected: GREEN, proving the type migration did not change directory behavior.

- [ ] **Step 3: Add failing file-target tests**

Cover:

- building and publishing a new file;
- replacing an existing file with backup cleanup;
- atomic refusal of a raced `must-not-exist` file;
- one transaction containing a directory and two files;
- rollback of already-promoted directory/file targets after a later file promotion failure;
- file staging cleanup after build failure;
- lexical and physical containment for files and symlinked parents;
- duplicate and parent/child overlap detection across file/directory target kinds;
- `{ state: "missing" }` rejects a concurrent creator before any backup;
- `{ state: "sha256", sha256 }` rejects changed/deleted content before any backup;
- unchanged expected content promotes successfully;
- a file builder that creates no staging file or creates a directory at that path is rejected;
- existing directory-only race, rollback, recovery-artifact, and cleanup tests remain green.

- [ ] **Step 4: Implement target-kind-neutral validation and staging**

Normalize `targetPath` for both union members and retain strict descendant checks. Each target gets
a same-parent staging container. Directory builders receive the container itself; file builders
receive `path.join(container, "payload")`. Validate the payload with `lstat().isFile()` after all
builders settle.

Store publication state in a separate internal object rather than mutating the public union:

```ts
interface PublicationTarget {
  readonly definition: OutputSetTarget
  readonly targetPath: string
  readonly stagingContainer: string
  readonly stagingPayload: string
  readonly backupPath: string
  backupCreated: boolean
  publicationCommitted: boolean
  targetOwned: boolean
}
```

- [ ] **Step 5: Implement safe file promotion and expectations**

Before any backup, validate every `expectedContent` in input order after all builds settle. Hash
exact bytes with SHA-256. For file `replace-existing`, rename any old target to its backup and then
rename the staged payload. For file `must-not-exist`, atomically create the destination with a
same-volume hard link from the staged payload; an `EEXIST` must fail without replacing the raced
file. Cleanup removes the remaining staging link/container.

Rollback removes owned files/directories and restores backups in reverse target order. Recovery
messages must identify the exact target and retained backup path.

- [ ] **Step 6: Verify publisher compatibility and architecture**

```powershell
node --test src/infrastructure/filesystem/transactional-output-set-publisher.test.ts src/adapters/etterna/install/etterna-skin-installer.test.ts
npm run typecheck
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run test:architecture
npx @biomejs/biome check src/application/ports/output-set-publisher.ts src/infrastructure/filesystem/transactional-output-set-publisher.ts src/infrastructure/filesystem/transactional-output-set-publisher.test.ts src/adapters/etterna/install/etterna-skin-installer.ts src/adapters/etterna/install/etterna-skin-installer.test.ts
```

Expected: all exit 0.

---

### Task 6: Publish the Four Etterna Outputs as One Installation

**Files:**
- Modify: `src/adapters/etterna/install/etterna-skin-installer.ts`
- Modify: `src/adapters/etterna/install/etterna-skin-installer.test.ts`
- Modify: `src/cli/routes/run-osu-to-etterna.ts`
- Modify: `src/cli/routes/run-osu-to-etterna.test.ts`

**Interfaces:**
- Consumes: `EtternaJudgementWriter`, `prepareEtternaAssetsConfigUpdate`, output/path helpers, and mixed targets from Tasks 3-5.
- Produces: one four-target `EtternaSkinInstaller.installSkin` transaction.

- [ ] **Step 1: Recheck concurrent diffs before touching shared composition files**

```powershell
git diff -- src/adapters/etterna/install/etterna-skin-installer.ts src/adapters/etterna/install/etterna-skin-installer.test.ts src/cli/routes/run-osu-to-etterna.ts src/cli/routes/run-osu-to-etterna.test.ts
```

- [ ] **Step 2: Add failing installer tests**

Extend dependencies with:

```ts
readonly judgementWriter: Pick<EtternaJudgementWriter, "writeJudgement">
readonly assetsConfigWriter: {
  prepareUpdate(
    filePath: string,
    guid: string,
    judgementPath: string,
  ): Promise<PreparedEtternaAssetsConfigUpdate>
  writeUpdate(
    outputFile: string,
    update: PreparedEtternaAssetsConfigUpdate,
  ): Promise<void>
}
```

Assert the published targets, in order, are:

```ts
[
  { kind: "directory", targetPath: noteSkinPath },
  { kind: "directory", targetPath: profilePath },
  { kind: "file", targetPath: judgementFile, policy: "must-not-exist" },
  {
    kind: "file",
    targetPath: assetsConfigFile,
    policy: "replace-existing",
    expectedContent: prepared.expectation,
  },
]
```

Invoke all builders in the test and assert the judgement writer receives the converted model and
staging file, while `assetsConfigWriter.writeUpdate` receives the staging file and exact prepared
update. Add failures for absent judgements, unsafe derived output, and preparation failure before
`publisher.publish`.

- [ ] **Step 3: Implement installer orchestration**

After allocating the identity:

1. derive filename from skin name, GUID, and `sourceDensity`;
2. derive disk and forward-slash relative paths;
3. resolve `<theme>_settings/assetsConfig.lua`;
4. prepare the config update before publication;
5. publish the four explicit targets.

Keep the existing NoteSkin overwrite policy. The profile and unique judgement file use
`must-not-exist`; config uses `replace-existing` plus the recorded expectation.

- [ ] **Step 4: Wire production dependencies**

In `createDefaultEtternaInstaller`, instantiate `EtternaJudgementWriter` and provide an
`assetsConfigWriter` whose methods delegate to `prepareEtternaAssetsConfigUpdate` and
`writeEtternaAssetsConfigUpdate`. Do not alter CLI prompt order, skin overwrite confirmation,
theme lookup, or conversion registry setup.

- [ ] **Step 5: Verify installer and CLI route**

```powershell
node --test src/adapters/etterna/install/etterna-skin-installer.test.ts src/cli/routes/run-osu-to-etterna.test.ts src/cli/routes/run-etterna-to-osu.test.ts
npx @biomejs/biome check src/adapters/etterna/install/etterna-skin-installer.ts src/adapters/etterna/install/etterna-skin-installer.test.ts src/cli/routes/run-osu-to-etterna.ts src/cli/routes/run-osu-to-etterna.test.ts
npm run typecheck
```

Expected: all exit 0 and the Etterna-to-osu! CLI route remains unchanged.

---

### Task 7: End-to-End Proof and Documentation

**Files:**
- Modify: `tests/integration/osu-to-etterna.test.ts`
- Verify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`
- Modify: `docs/development-standards.md`
- Modify: `docs/agent-prompt-guidelines.md`

**Interfaces:**
- Consumes: the complete production route.
- Produces: executable proof and current documentation for judgement migration.

- [ ] **Step 1: Check integration/docs for concurrent edits**

```powershell
git diff -- tests/integration/osu-to-etterna.test.ts readme.md docs/architecture.md docs/development-standards.md docs/agent-prompt-guidelines.md
```

Preserve changes from the other agent and make only judgement-specific insertions.

- [ ] **Step 2: Extend the reverse integration fixture**

Create six PNGs referenced by the 4K `Hit*` properties. Use unequal dimensions and independent
RGBA colors. Keep the current 1920x1080 osu! configuration and provide both SD and `@2x` variants
with distinguishable colors so the output proves the existing HD selection rule.

Seed `Save/<theme>_settings/assetsConfig.lua` with comments plus unrelated `avatar`, `toasty`, and
`judgment.default` entries. Capture that unrelated text literally.

- [ ] **Step 3: Add end-to-end assertions**

After conversion, read the new profile GUID from `Etterna.xml`. Assert exactly one generated
judgement filename contains that GUID and ends in `1x6 (Doubleres).png`. Decode the sheet and
assert:

```ts
assert.equal(info.width, maximumHdWidth)
assert.equal(info.height, maximumHdHeight * 6)
```

For each row, assert the centered source rectangle has its independent HD RGBA and surrounding
padding alpha is zero. Read `assetsConfig.lua` and assert its new GUID maps to the exact
forward-slash relative path while every seeded unrelated byte sequence remains present. Assert no
SD sheet and no orphan judgement file exists.

Run the overwrite-decline and promotion-failure integration cases and assert they create neither
profile, judgement, nor config mapping and preserve prior targets.

- [ ] **Step 4: Run the bidirectional integration tests**

```powershell
node --test tests/integration/osu-to-etterna.test.ts tests/integration/etterna-to-osu.test.ts
```

Expected: all tests pass; forward output inventory and judgement images remain unchanged.

- [ ] **Step 5: Update current documentation**

Update the README and architecture/standards/prompt guidelines to state:

- reverse conversion now migrates the six judgement images but not `JudgmentZoom`;
- density selection uses the osu! CFG rules and mixed density is rejected;
- unequal sources are centered without scaling in maximum-size transparent cells;
- output naming includes skin name, profile GUID, `1x6`, and conditional `(Doubleres)`;
- the profile mapping is inserted into the active theme's `assetsConfig.lua` without replacing
  unrelated configuration;
- the four outputs are one mixed file/directory transaction;
- future prompts must specify semantic row order, density, padding/alignment, configuration
  ownership, and rollback expectations.

Do not rewrite historical specs or plans.

- [ ] **Step 6: Run the complete verification matrix**

```powershell
npm test
npm run typecheck
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run lint
npm run test:architecture
git diff --check
```

Expected: every command exits 0. Do not run the manual trim script.

- [ ] **Step 7: Audit scope and concurrent-work preservation**

Run:

```powershell
git status --short
git diff --name-only
```

Compare the final changed files with this plan and the pre-task diffs. Confirm no unrelated file
was reverted, overwritten, staged, committed, or cleaned. Report any platform skips separately
from failures.
