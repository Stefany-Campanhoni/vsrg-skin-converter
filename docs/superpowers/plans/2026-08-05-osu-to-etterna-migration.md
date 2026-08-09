# osu! to Etterna Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe 4K-only osu!mania-to-Etterna conversion that installs a generated NoteSkin and a new theme-aware local profile while preserving the existing Etterna-to-osu! behavior.

**Architecture:** Add osu! source adapters, a dedicated reverse conversion, target-specific Etterna NoteSkin/profile writers, and a generic multi-target transactional publisher. Keep the existing `convertSkin`, `OsuSkinWriter`, and `TransactionalOutputPublisher` unchanged; the CLI delegates each direction to a focused route coordinator.

**Tech Stack:** TypeScript 7, Node.js 22 APIs and test runner, Sharp, `@clack/prompts`, Biome.

## Global Constraints

- Support only a single unambiguous `[Mania]` section with `Keys: 4`.
- Support only PNG image assets.
- Do not migrate judgements, judgement zoom, combo zoom, long notes, or fonts.
- Do not rotate or resize tap notes.
- Use CFG-driven density only when the `skin.ini` reference does not explicitly contain `@2x`.
- Treat `Width > 1280 || Height > 720` as high resolution; exactly `1280x720` is standard resolution.
- Use `NoteFieldY = round(HitPosition) - 439`.
- Use `ComboY = round(ComboPosition) - 229`.
- Use `JudgmentY = round(ScorePosition) - 240`.
- Use `ReceptorSize = round(arithmeticMean(ColumnWidth) + 38)`.
- Publish the NoteSkin and new profile atomically; never overwrite a profile.
- Ask before replacing an existing NoteSkin and cancel everything when declined.
- Preserve the current Etterna-to-osu! behavior and regression tests.
- Keep technical identifiers, errors, comments, and documentation in English.
- Do not execute or modify the manual `.tmp` receptor script during this feature.
- Do not create commits; leave each completed block in the worktree for IDE review.

---

### Task 1: Parse and Discover osu! User Configurations

**Files:**
- Create: `src/adapters/osu/config/osu-user-configuration.ts`
- Create: `src/adapters/osu/config/osu-user-configuration.test.ts`

**Interfaces:**
- Produces:

```ts
export interface OsuUserConfiguration {
  readonly filePath: string
  readonly username: string
  readonly width: number
  readonly height: number
  readonly useDoubleResolutionAssets: boolean
}

export function parseOsuUserConfiguration(
  source: string,
  filePath: string,
): OsuUserConfiguration

export async function listOsuUserConfigurations(
  osuRoot: string,
): Promise<OsuUserConfiguration[]>
```

- [ ] **Step 1: Write the failing parser tests**

Cover windowed, fullscreen, exact-threshold, width-only-high, height-only-high, missing
properties, invalid `Fullscreen`, non-positive dimensions, and an empty/multiline username.
The central assertions are:

```ts
test("uses the active fullscreen resolution and marks larger displays as double resolution", () => {
  const result = parseOsuUserConfiguration(
    `Username = Alice
Fullscreen = 1
Width = 1280
Height = 720
WidthFullscreen = 1920
HeightFullscreen = 1080`,
    "C:/osu!/osu!.Alice.cfg",
  )

  assert.equal(result.username, "Alice")
  assert.equal(result.width, 1920)
  assert.equal(result.height, 1080)
  assert.equal(result.useDoubleResolutionAssets, true)
})

test("keeps exactly 1280x720 at standard resolution", () => {
  const result = parseOsuUserConfiguration(
    `Username = Alice
Fullscreen = 0
Width = 1280
Height = 720`,
    "C:/osu!/osu!.Alice.cfg",
  )

  assert.equal(result.useDoubleResolutionAssets, false)
})
```

- [ ] **Step 2: Run the parser test and verify RED**

Run:

```powershell
node --test src/adapters/osu/config/osu-user-configuration.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the CFG parser**

Parse the first `=` on assignment lines, compare property names case-insensitively, let
the last property assignment win, validate required values, and return contextual errors
containing `filePath`. Derive resolution with:

```ts
const useDoubleResolutionAssets = width > 1280 || height > 720
```

Reject newline characters in `Username`; trim surrounding whitespace without changing
internal characters.

- [ ] **Step 4: Write the failing catalog tests**

Create a temporary osu! root containing `osu!.Alice.cfg`, `osu!.Bob.CFG`, `osu!.cfg`, and
an unrelated file. Assert that only the first two are returned, sorted by username, and
that no matching configurations throws with the osu! root in the error.

- [ ] **Step 5: Implement configuration discovery**

Read only immediate regular files matching `/^osu!\..+\.cfg$/i`, parse every matching
configuration through `parseOsuUserConfiguration`, and use `settleAll` with
`invokeAsPromise` so sibling reads settle before the first input-order failure is rethrown.

- [ ] **Step 6: Verify Task 1**

Run:

```powershell
node --test src/adapters/osu/config/osu-user-configuration.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 2: Parse Repeated osu! INI Sections and Catalog Skins

**Files:**
- Create: `src/adapters/osu/skin-ini/osu-skin-ini.ts`
- Create: `src/adapters/osu/skin-ini/osu-skin-ini.test.ts`
- Create: `src/adapters/osu/catalog/osu-skin-catalog.ts`
- Create: `src/adapters/osu/catalog/osu-skin-catalog.test.ts`

**Interfaces:**
- Produces:

```ts
export interface OsuIniSection {
  readonly name: string
  readonly properties: ReadonlyMap<string, string>
}

export interface OsuMania4kDefinition {
  readonly hitPosition: number
  readonly comboPosition: number
  readonly judgementPosition: number
  readonly columnWidths: readonly number[]
  readonly normalReceptors: readonly [string, string, string, string]
  readonly pressedReceptors: readonly [string, string, string, string]
  readonly tapNotes: readonly [string, string, string, string]
}

export function parseOsuSkinIni(source: string, filePath: string): readonly OsuIniSection[]
export function readOsuSkinName(
  sections: readonly OsuIniSection[],
  filePath: string,
): string
export function readOsuMania4kDefinition(
  sections: readonly OsuIniSection[],
  filePath: string,
): OsuMania4kDefinition

export class OsuSkinCatalog implements SkinCatalog {
  listSkins(location: string): Promise<SkinReference[]>
}
```

- [ ] **Step 1: Write the failing ordered-section tests**

Use a fixture containing `[General]`, 1K, 4K, and another Mania section. Include an Author
value containing another colon and a repeated 4K property. Assert that sections remain
ordered, the complete value after the first colon is preserved, names are case-insensitive,
and the last property wins.

```ts
const sections = parseOsuSkinIni(source, "C:/osu!/Skins/Test/skin.ini")
assert.equal(readOsuSkinName(sections, "skin.ini"), "Fixture Name")
assert.deepEqual(readOsuMania4kDefinition(sections, "skin.ini").columnWidths, [68, 68, 70, 70])
```

Also assert fatal errors for zero/two 4K sections, missing required properties, malformed
numbers, non-positive widths, and `ColumnWidth` counts other than one or four. A scalar
width must expand to four equal values.

- [ ] **Step 2: Run the INI tests and verify RED**

Run:

```powershell
node --test src/adapters/osu/skin-ini/osu-skin-ini.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the ordered parser and 4K projection**

Preserve repeated section objects, store property keys normalized to lowercase, split only
on the first colon, ignore blank/comment lines, and reject assignments outside a section
when they are requested semantically. Use exact `Keys === 4` selection. Build the four
asset tuples explicitly rather than casting an unchecked array.

- [ ] **Step 4: Write the failing catalog tests**

Create immediate skin directories with mixed-case `Skin.InI`, valid General names, an
unrelated file, and a nested directory. Assert that `SkinReference` contains:

```ts
{
  game: "osu",
  name: "Fixture Name",
  sourcePath: path.join(osuRoot, "Skins", "Folder Name"),
  gameRoot: osuRoot,
}
```

Assert sorting by General name and contextual failure when a skin has no usable `skin.ini`
or General name.

- [ ] **Step 5: Implement `OsuSkinCatalog`**

List only immediate directories below `<location>/Skins`, locate exactly one
case-insensitive `skin.ini`, parse only enough semantic data to read General Name, and
settle concurrent reads with the project's async primitives.

- [ ] **Step 6: Verify Task 2**

Run:

```powershell
node --test src/adapters/osu/skin-ini/osu-skin-ini.test.ts src/adapters/osu/catalog/osu-skin-catalog.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 3: Resolve Safe PNG Assets and Preserve Density

**Files:**
- Modify: `src/domain/image.ts`
- Create: `src/adapters/osu/assets/resolve-osu-png-asset.ts`
- Create: `src/adapters/osu/assets/resolve-osu-png-asset.test.ts`

**Interfaces:**
- Adds to `ImageAsset` without changing existing consumers:

```ts
export const imageDensities = ["standard", "double"] as const
export type ImageDensity = (typeof imageDensities)[number]

export interface ImageAsset {
  filePath: string
  frame?: SpriteFrame
  rotation: number
  pixelDensity?: ImageDensity
}
```

- Produces:

```ts
export interface ResolveOsuPngAssetOptions {
  readonly skinDirectory: string
  readonly logicalPath: string
  readonly useDoubleResolutionAssets: boolean
}

export async function resolveOsuPngAsset(
  options: ResolveOsuPngAssetOptions,
): Promise<ImageAsset>
```

- [ ] **Step 1: Write the failing density tests**

Create PNG fixtures for `Notes/Pink.png` and `Notes/Pink@2x.png`. Assert:

```ts
assert.equal(
  (await resolveOsuPngAsset({
    skinDirectory,
    logicalPath: "notes\\pink",
    useDoubleResolutionAssets: false,
  })).pixelDensity,
  "standard",
)

assert.equal(
  (await resolveOsuPngAsset({
    skinDirectory,
    logicalPath: "notes\\pink",
    useDoubleResolutionAssets: true,
  })).pixelDensity,
  "double",
)
```

Assert that explicit `notes\\pink@2x` selects double density even in standard mode and
that a missing selected density does not fall back.

- [ ] **Step 2: Write the failing safety tests**

Cover `.jpg`, `.jpeg`, absolute paths, `..`, mixed-case physical names, case-insensitive
ambiguity, path-segment ambiguity, a directory instead of a file, and a symlink whose real
target escapes the skin. Assert `rotation === 0`, no frame, and contextual errors.

- [ ] **Step 3: Run the resolver tests and verify RED**

Run:

```powershell
node --test src/adapters/osu/assets/resolve-osu-png-asset.test.ts
```

Expected: FAIL because the resolver and density vocabulary do not exist.

- [ ] **Step 4: Implement exact variant selection**

Normalize `/` and `\\` as logical separators, reject unsafe segments before filesystem
access, and add `.png` only when no extension exists. Insert `@2x` immediately before
`.png` only when the reference is implicit and high resolution. Explicit `@2x` always sets
double density. Resolve every segment through case-insensitive directory enumeration,
reject multiple matches, require a regular file, and compare `realpath` containment with
the skin's real path.

- [ ] **Step 5: Verify Task 3 and forward compatibility**

Run:

```powershell
node --test src/adapters/osu/assets/resolve-osu-png-asset.test.ts
npm test
npm run typecheck
npm run lint
```

Expected: all existing Etterna source tests remain green; optional density metadata causes
no forward behavior change.

---

### Task 4: Build the osu! Skin Reader

**Files:**
- Create: `src/adapters/osu/reader/osu-skin-reader.ts`
- Create: `src/adapters/osu/reader/osu-skin-reader.test.ts`

**Interfaces:**
- Consumes: `parseOsuSkinIni`, `readOsuSkinName`, `readOsuMania4kDefinition`, and
  `resolveOsuPngAsset`.
- Produces:

```ts
export interface OsuSkinReaderConfiguration {
  readonly useDoubleResolutionAssets: boolean
}

export class OsuSkinReader implements SkinReader {
  readonly game = "osu"
  constructor(configuration: OsuSkinReaderConfiguration)
  readSkin(reference: SkinReference): Promise<SkinModel>
}
```

- [ ] **Step 1: Write the failing reader test**

Use an injected reader/resolver dependency object so the test can assert all twelve logical
references are started and settled. Return distinguishable `ImageAsset` objects and assert
the direction mapping, metadata name, and:

```ts
assert.deepEqual(model.playfield, {
  hitPosition: 436,
  comboPosition: 250,
  judgementPosition: 280,
  columnWidth: 69,
  comboScale: 1,
  judgementScale: 1,
})
assert.equal(model.assets.judgements, undefined)
```

The width fixture is `68,68,70,70`; `69` is its arithmetic mean before target conversion.

- [ ] **Step 2: Add failure/quiescence tests**

Reject references from another game. Verify all twelve resolutions settle when one fails,
and preserve the first input-order error with asset property context.

- [ ] **Step 3: Run the reader tests and verify RED**

Run:

```powershell
node --test src/adapters/osu/reader/osu-skin-reader.test.ts
```

Expected: FAIL because `OsuSkinReader` does not exist.

- [ ] **Step 4: Implement the reader**

Locate `skin.ini` case-insensitively inside `reference.sourcePath`, parse the source again
to avoid catalog state coupling, resolve the 12 required assets with the configured density
mode, map indexes through `columnDirections`, calculate the arithmetic mean, and return an
osu! `SkinModel` with empty diagnostics and absent judgements.

- [ ] **Step 5: Verify Task 4**

Run:

```powershell
node --test src/adapters/osu/reader/osu-skin-reader.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 5: Add the osu!-to-Etterna Conversion

**Files:**
- Create: `src/conversions/osu-to-etterna/convert-hit-position.ts`
- Create: `src/conversions/osu-to-etterna/convert-hit-position.test.ts`
- Create: `src/conversions/osu-to-etterna/convert-combo-position.ts`
- Create: `src/conversions/osu-to-etterna/convert-combo-position.test.ts`
- Create: `src/conversions/osu-to-etterna/convert-judgement-position.ts`
- Create: `src/conversions/osu-to-etterna/convert-judgement-position.test.ts`
- Create: `src/conversions/osu-to-etterna/convert-receptor-size.ts`
- Create: `src/conversions/osu-to-etterna/convert-receptor-size.test.ts`
- Create: `src/conversions/osu-to-etterna/osu-to-etterna-conversion.ts`
- Create: `src/conversions/osu-to-etterna/osu-to-etterna-conversion.test.ts`

**Interfaces:**

```ts
export function getEtternaHitPosition(osuHitPosition: number): number
export function getEtternaComboPosition(osuComboPosition: number): number
export function getEtternaJudgementPosition(osuJudgementPosition: number): number
export function getEtternaReceptorSize(osuAverageColumnWidth: number): number

export class OsuToEtternaConversion implements SkinConversion {
  readonly source = "osu"
  readonly target = "etterna"
  convert(source: SkinModel): Promise<SkinModel>
}
```

- [ ] **Step 1: Write the failing formula tests**

Assert exact calibration and rounding:

```ts
assert.equal(getEtternaHitPosition(439), 0)
assert.equal(getEtternaHitPosition(432), -7)
assert.equal(getEtternaComboPosition(229), 0)
assert.equal(getEtternaComboPosition(209), -20)
assert.equal(getEtternaJudgementPosition(240), 0)
assert.equal(getEtternaJudgementPosition(244), 4)
assert.equal(getEtternaReceptorSize(69), 107)
assert.equal(getEtternaReceptorSize(68.5), 107)
```

Add decimal inputs proving rounding happens before the integer offset. Keep named calibration
constants in their owning reverse-conversion modules; do not introduce anonymous numeric
literals inside formulas.

- [ ] **Step 2: Run formula tests and verify RED**

Run:

```powershell
node --test src/conversions/osu-to-etterna/*.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the focused formulas**

Use `gameDefaults` for the game coordinate baselines and named reverse-route calibration
offsets. The receptor-size module owns the `62` osu! equivalent and `100` Etterna default.

- [ ] **Step 4: Write the failing conversion tests**

Convert a complete osu! model and assert only `game` and the four playfield values change.
Asset objects and diagnostics must retain identity. Reject an Etterna source model.

- [ ] **Step 5: Implement and verify the conversion**

Run:

```powershell
node --test src/conversions/osu-to-etterna/*.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 6: Normalize osu! Receptors Vertically

**Files:**
- Create: `src/infrastructure/image/normalize-osu-receptor.ts`
- Create: `src/infrastructure/image/normalize-osu-receptor.test.ts`

**Interfaces:**

```ts
export async function normalizeOsuReceptorImage(image: Buffer): Promise<Buffer>
```

- [ ] **Step 1: Write failing geometry tests**

Generate an RGBA PNG whose full size is `8x14`, whose visible rows are `3..10`, and whose
visible pixels do not occupy the lateral edges. Assert the output is `8x8`, lateral
transparent columns remain present, and visible colors are not horizontally stretched.

Add a second fixture with a `10x4` visible region to prove vertical stretching to `10x10`.

- [ ] **Step 2: Add transparent and invalid-image tests**

Assert a fully transparent PNG is returned byte-for-byte and an undecodable buffer rejects
with receptor-normalization context. Infrastructure must not implement pressed-to-normal
fallback.

- [ ] **Step 3: Run the image tests and verify RED**

Run:

```powershell
node --test src/infrastructure/image/normalize-osu-receptor.test.ts
```

Expected: FAIL because the normalizer does not exist.

- [ ] **Step 4: Implement vertical-only normalization**

Decode to raw RGBA, scan alpha by row, return the original buffer when no row is visible,
extract `{ left: 0, width, top: firstVisibleRow, height: visibleRowCount }`, then resize to
`width x width` with `fit: "fill"` and encode PNG. Validate metadata before arithmetic.

- [ ] **Step 5: Verify Task 6**

Run:

```powershell
node --test src/infrastructure/image/normalize-osu-receptor.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 7: Write the Etterna NoteSkin Workspace

**Files:**
- Create: `src/adapters/etterna/writer/etterna-asset-filename.ts`
- Create: `src/adapters/etterna/writer/etterna-asset-filename.test.ts`
- Create: `src/adapters/etterna/writer/write-etterna-notes.ts`
- Create: `src/adapters/etterna/writer/write-etterna-notes.test.ts`
- Create: `src/adapters/etterna/writer/write-etterna-receptors.ts`
- Create: `src/adapters/etterna/writer/write-etterna-receptors.test.ts`
- Create: `src/adapters/etterna/writer/etterna-note-skin-writer.ts`
- Create: `src/adapters/etterna/writer/etterna-note-skin-writer.test.ts`

**Interfaces:**

```ts
export function getEtternaAssetFilename(
  logicalName: string,
  pixelDensity: ImageDensity,
): string

export async function writeEtternaNotes(options: {
  notes: TapNoteSet
  outputDirectory: string
}): Promise<void>

export async function writeEtternaReceptors(options: {
  receptors: ReceptorSet
  outputDirectory: string
}): Promise<void>

export class EtternaNoteSkinWriter implements SkinWriter {
  readonly game = "etterna"
  constructor(templatesDirectory: string)
  writeSkin(skin: SkinModel, workspace: string): Promise<void>
}
```

- [ ] **Step 1: Write failing filename and note tests**

Assert `"_Left Tap Note"` becomes `_Left Tap Note.png` for standard density and
`_Left Tap Note (doubleres).png` for double density. Write four distinguishable source PNG
buffers and assert byte-identical files below `Notes/` with the exact direction names.
Missing `pixelDensity` in an osu!-derived Etterna output is a contextual writer error rather
than an implicit guess.

- [ ] **Step 2: Run the note tests and verify RED**

Run:

```powershell
node --test src/adapters/etterna/writer/etterna-asset-filename.test.ts src/adapters/etterna/writer/write-etterna-notes.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement density naming and byte-preserving note writes**

Map directions through an explicit readonly record. Start and settle all reads before
starting writes, then start and settle all writes so partial files are not produced when a
read fails.

- [ ] **Step 4: Write failing receptor tests**

Assert all eight exact names, square normalized dimensions, and per-asset density. Add:

- a transparent normal that remains byte-identical;
- a transparent pressed asset that writes the processed normal buffer under a pressed name;
- a mismatched pressed density proving fallback uses the normal density decoration;
- a decode failure proving all sibling work settles and no write phase starts.

- [ ] **Step 5: Implement receptor fallback in the writer**

Read normal and pressed buffers per direction. Use the existing transparency inspection
primitive to select fallback, call `normalizeOsuReceptorImage` only for selected non-empty
buffers, and keep density policy in the writer. Complete every render before starting any
write.

- [ ] **Step 6: Write and implement the NoteSkin writer test**

Use a temporary template containing `NoteSkin.lua`, `metrics.ini`, and a static asset.
Assert the complete template is copied, generated `Receptors/` and `Notes/` files exist,
judgements are not required, and a non-Etterna model is rejected.

- [ ] **Step 7: Verify Task 7**

Run:

```powershell
node --test src/adapters/etterna/writer/*.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 8: Allocate Etterna Profile IDs and GUIDs

**Files:**
- Create: `src/adapters/etterna/profile/allocate-etterna-profile-identity.ts`
- Create: `src/adapters/etterna/profile/allocate-etterna-profile-identity.test.ts`

**Interfaces:**

```ts
export interface EtternaProfileIdentity {
  readonly id: string
  readonly guid: string
}

export interface AllocateEtternaProfileIdentityOptions {
  readonly randomBytes?: (size: number) => Buffer
  readonly maxGuidAttempts?: number
}

export async function allocateEtternaProfileIdentity(
  gameRoot: string,
  options?: AllocateEtternaProfileIdentityOptions,
): Promise<EtternaProfileIdentity>
```

- [ ] **Step 1: Write failing ID allocation tests**

Assert a missing/empty `LocalProfiles` directory yields `00000000`, mixed valid and invalid
names choose the maximum valid eight-digit ID plus one, gaps are not reused, and
`99999999` rejects.

- [ ] **Step 2: Write failing GUID tests**

Create valid profiles with `Etterna.xml` GUIDs. Inject deterministic byte buffers and assert:

```ts
assert.match(identity.guid, /^[0-9a-f]{16}$/)
```

Make the first generated GUID collide and the second succeed. Assert retry exhaustion,
invalid random-byte length, missing XML, unreadable XML, and missing existing GUID are fatal
with profile context.

- [ ] **Step 3: Run the identity tests and verify RED**

Run:

```powershell
node --test src/adapters/etterna/profile/allocate-etterna-profile-identity.test.ts
```

Expected: FAIL because the allocator does not exist.

- [ ] **Step 4: Implement allocation**

Reuse `resolveEtternaProfilesPath` and `resolveEtternaProfilePath`. Treat only `ENOENT` for
the profiles directory as no profiles. Read GUIDs from every valid profile concurrently and
settle all reads. Default to `node:crypto` `randomBytes`, require exactly eight returned
bytes, lower-case hex encoding, and a named default retry limit of `32`.

- [ ] **Step 5: Verify Task 8**

Run:

```powershell
node --test src/adapters/etterna/profile/allocate-etterna-profile-identity.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 9: Render the Etterna Profile Workspace

**Files:**
- Modify: `src/templates/etterna/profile/playerConfig.lua`
- Create: `src/adapters/etterna/templates/render-etterna-profile.ts`
- Create: `src/adapters/etterna/templates/render-etterna-profile.test.ts`
- Create: `src/adapters/etterna/writer/etterna-profile-writer.ts`
- Create: `src/adapters/etterna/writer/etterna-profile-writer.test.ts`

**Interfaces:**

```ts
export interface EtternaProfileTemplateValues {
  readonly profileName: string
  readonly guid: string
  readonly hitPosition: number
  readonly comboPosition: number
  readonly judgementPosition: number
  readonly receptorSize: number
}

export async function renderEtternaProfileTemplates(
  profileDirectory: string,
  theme: string,
  values: EtternaProfileTemplateValues,
): Promise<void>

export class EtternaProfileWriter {
  constructor(templatesDirectory: string)
  writeProfile(
    skin: SkinModel,
    workspace: string,
    configuration: { profileName: string; guid: string; theme: string },
  ): Promise<void>
}
```

- [ ] **Step 1: Write the failing production-template test**

Read `src/templates/etterna/profile/playerConfig.lua` and assert it contains:

```text
ReceptorSize= ${receptor_size}
```

Run the test before editing the template and verify it fails because `108` is still fixed.

- [ ] **Step 2: Add the receptor-size wildcard**

Replace only the fixed `ReceptorSize= 108` value. Keep fixed `JudgmentZoom=0.35` and
`ComboZoom=0.6` unchanged.

- [ ] **Step 3: Write failing contextual-rendering tests**

Use profile name `A&B <Player>` and assert XML text becomes `A&amp;B &lt;Player&gt;`, while
Editable.ini retains valid literal text. Reject CR/LF in the profile name, invalid GUID,
unsafe theme names, non-finite numeric values, and unresolved `${...}` wildcards.

Assert `playerConfig.lua` is moved from the workspace root to
`Rebirth_settings/playerConfig.lua` and contains exact integer values.

- [ ] **Step 4: Implement strict target-specific rendering**

Do not reuse unescaped XML replacements. Render each file with its destination-specific
encoder, require every expected wildcard exactly where owned, reject leftovers, create the
theme settings directory, and move the rendered player config there.

- [ ] **Step 5: Write and implement the profile writer test**

Copy a temporary profile template, render it, assert `Editable.ini`, `Etterna.xml`, and
`Type.ini` remain at the root, and assert only `playerConfig.lua` moves below the active
theme. Reject a non-Etterna model. Do not create `assetsConfig.lua`.

- [ ] **Step 6: Verify Task 9**

Run:

```powershell
node --test src/adapters/etterna/templates/render-etterna-profile.test.ts src/adapters/etterna/writer/etterna-profile-writer.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

---

### Task 10: Publish Multiple Output Directories Transactionally

**Files:**
- Create: `src/application/ports/output-set-publisher.ts`
- Create: `src/infrastructure/filesystem/transactional-output-set-publisher.ts`
- Create: `src/infrastructure/filesystem/transactional-output-set-publisher.test.ts`

**Interfaces:**

```ts
export const outputTargetPolicies = ["must-not-exist", "replace-existing"] as const
export type OutputTargetPolicy = (typeof outputTargetPolicies)[number]

export interface OutputSetTarget {
  readonly targetDirectory: string
  readonly allowedRoot: string
  readonly policy: OutputTargetPolicy
  readonly build: OutputBuilder
}

export interface OutputSetPublisher {
  publish(targets: readonly OutputSetTarget[]): Promise<void>
}

export class TransactionalOutputSetPublisher implements OutputSetPublisher {
  publish(targets: readonly OutputSetTarget[]): Promise<void>
}
```

- [ ] **Step 1: Write failing validation/build tests**

Reject zero targets, duplicate/overlapping targets, roots, targets outside `allowedRoot`, a
target equal to `allowedRoot`, and an existing `must-not-exist` target. Assert every builder
starts and settles before any target changes when one builder fails synchronously or
asynchronously.

- [ ] **Step 2: Write failing promotion/rollback tests**

Use injected filesystem operations to fail each rename boundary. Assert:

- an authorized previous NoteSkin is restored byte-for-byte;
- a newly promoted profile is removed when a later promotion fails;
- no backup is deleted before all promotions succeed;
- all staging directories are removed on success and failure;
- the original first input-order failure object is preserved with publication context.

- [ ] **Step 3: Run publisher tests and verify RED**

Run:

```powershell
node --test src/infrastructure/filesystem/transactional-output-set-publisher.test.ts
```

Expected: FAIL because the publisher does not exist.

- [ ] **Step 4: Implement two-phase multi-target publication**

Validate and normalize all paths first. Create unique sibling staging/backup names. Build
and settle all staging workspaces. Recheck policies immediately before promotion. Move all
existing replaceable targets to backups, promote stagings in input order, and on failure
remove promoted new targets before restoring backups in reverse order. Cleanup must itself
settle across all targets while preserving the primary error.

- [ ] **Step 5: Verify Task 10 and existing publisher compatibility**

Run:

```powershell
node --test src/infrastructure/filesystem/transactional-output-publisher.test.ts src/infrastructure/filesystem/transactional-output-set-publisher.test.ts
npm run typecheck
npm run lint
npm run test:architecture
```

Expected: both publisher implementations pass independently.

---

### Task 11: Coordinate Etterna Installation and Conversion

**Files:**
- Modify: `src/adapters/etterna/settings/etterna-settings-paths.ts`
- Modify: `src/adapters/etterna/settings/etterna-settings-paths.test.ts`
- Create: `src/application/ports/skin-installer.ts`
- Create: `src/application/conversion/convert-and-install-skin.ts`
- Create: `src/application/conversion/convert-and-install-skin.test.ts`
- Create: `src/adapters/etterna/install/etterna-skin-installer.ts`
- Create: `src/adapters/etterna/install/etterna-skin-installer.test.ts`

**Interfaces:**

```ts
export function resolveEtternaNoteSkinPath(gameRoot: string, skinName: string): string

export interface SkinInstaller {
  readonly game: GameId
  installSkin(skin: SkinModel): Promise<void>
}

export interface ConvertAndInstallSkinRequest {
  readonly reference: SkinReference
  readonly targetGame: GameId
}

export async function convertAndInstallSkin(
  request: ConvertAndInstallSkinRequest,
  dependencies: {
    readers: ReadonlyMap<GameId, SkinReader>
    installers: ReadonlyMap<GameId, SkinInstaller>
    conversions: ConversionRegistry
  },
): Promise<ConversionResult>

export interface EtternaSkinInstallerConfiguration {
  readonly gameRoot: string
  readonly profileName: string
  readonly theme: string
  readonly overwriteExistingNoteSkin: boolean
}

export class EtternaSkinInstaller implements SkinInstaller {
  readonly game = "etterna"
}
```

- [ ] **Step 1: Extend safe Etterna paths test-first**

Assert the NoteSkin path resolves exactly below `NoteSkins/dance`, accepts the approved
example name, and rejects empty, separators, absolute names, Windows-invalid characters,
reserved device names, and trailing dot/space. Reuse one private Etterna directory-segment
validator rather than duplicating weaker checks.

- [ ] **Step 2: Write failing application use-case tests**

Mirror `convert-skin.test.ts`: assert reader, conversion, and installer order; ordered
diagnostics; missing reader/installer errors; and no installation after a read or conversion
failure. Existing `convertSkin` tests remain unchanged.

- [ ] **Step 3: Implement the generic installation use case**

Resolve dependencies by source and target game, read once, convert once, install once, and
return converted diagnostics. Do not add output-directory knowledge to this use case.

- [ ] **Step 4: Write failing installer tests**

Inject identity allocator, writers, and output-set publisher. Assert the exact two targets:

```ts
[
  {
    targetDirectory: path.join(gameRoot, "NoteSkins", "dance", skin.metadata.name),
    policy: overwriteExistingNoteSkin ? "replace-existing" : "must-not-exist",
  },
  {
    targetDirectory: path.join(gameRoot, "Save", "LocalProfiles", "00000004"),
    policy: "must-not-exist",
  },
]
```

Assert the profile writer receives CFG username, generated GUID, and active theme. Reject a
non-Etterna model before allocation.

- [ ] **Step 5: Implement `EtternaSkinInstaller`**

Capture target configuration in the constructor, allocate identity once, create both
builder closures, set allowed roots to `NoteSkins/dance` and `Save/LocalProfiles`, and let
the output-set publisher own all filesystem mutation.

- [ ] **Step 6: Verify Task 11**

Run:

```powershell
node --test src/adapters/etterna/settings/etterna-settings-paths.test.ts src/application/conversion/convert-and-install-skin.test.ts src/adapters/etterna/install/etterna-skin-installer.test.ts
npm run typecheck
npm run lint
npm run test:architecture
```

Expected: all commands exit `0`.

---

### Task 12: Add Direction-Specific CLI Routes

**Files:**
- Modify: `src/cli/prompts.ts`
- Create: `src/cli/routes/run-etterna-to-osu.ts`
- Create: `src/cli/routes/run-etterna-to-osu.test.ts`
- Create: `src/cli/routes/run-osu-to-etterna.ts`
- Create: `src/cli/routes/run-osu-to-etterna.test.ts`
- Modify: `src/cli/main.ts`
- Modify: `src/cli/main.test.ts`
- Modify: `src/config/paths.ts`
- Modify: `src/config/paths.test.ts`

**Interfaces:**

```ts
export async function askConfirm(message: string): Promise<boolean | undefined>

export const etternaTemplatesPath = path.resolve("src", "templates", "etterna")

export async function selectOsuUserConfiguration(
  configurations: readonly OsuUserConfiguration[],
  selectConfiguration: SelectConfiguration,
): Promise<OsuUserConfiguration | undefined>

export async function runEtternaToOsuRoute(dependencies?: EtternaToOsuRouteDependencies): Promise<void>
export async function runOsuToEtternaRoute(dependencies?: OsuToEtternaRouteDependencies): Promise<void>
```

- [ ] **Step 1: Add prompt behavior tests**

Inject/capture the Clack confirmation result. Assert cancellation calls the standard cancel
path and returns `undefined`; explicit true/false remain true/false.

- [ ] **Step 2: Extract the existing forward route under regression tests**

Move the current Etterna source installation, profile selection, theme lookup, skin
selection, osu! target resolution, `convertSkin`, and diagnostic presentation into
`run-etterna-to-osu.ts`. Its route test must assert the same call order, prompts, output
path, and cancellation points before `main.ts` delegates to it.

- [ ] **Step 3: Write failing osu! configuration-selection tests**

Assert one configuration skips prompting, multiple configurations display Username labels
and file-path values, cancellation returns undefined, and a returned path not in the
catalog rejects.

- [ ] **Step 4: Write failing reverse-route tests**

Inject all external dependencies and assert:

1. osu! default resolution and fallback message;
2. configuration selection before skin reading;
3. skin selection using General Name labels;
4. Etterna default resolution and fallback message;
5. target theme lookup through `readEtternaTheme`;
6. NoteSkin existence check;
7. no overwrite prompt when absent;
8. decline returns before installer construction/publication;
9. acceptance passes `overwriteExistingNoteSkin: true`;
10. `OsuSkinReader` receives the selected density mode;
11. `EtternaSkinInstaller` receives Username and theme;
12. diagnostics use the existing formatting.

- [ ] **Step 5: Implement the reverse route and thin composition root**

Register both source games and both conversions. `runCli` asks only the source game, then
dispatches `etterna` to the preserved forward route and `osu` to the new reverse route.
Derive the other game as target inside each route rather than exposing unsupported pairs.

- [ ] **Step 6: Verify Task 12**

Run:

```powershell
node --test src/cli/*.test.ts src/cli/routes/*.test.ts
npm run typecheck
npm run lint
npm run test:architecture
```

Expected: all commands exit `0` and forward route assertions remain unchanged.

---

### Task 13: Prove End-to-End Migration and Update Documentation

**Files:**
- Create: `tests/integration/osu-to-etterna.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/development-standards.md`
- Modify: `docs/agent-prompt-guidelines.md`

**Interfaces:**
- Consumes every public component from Tasks 1-12.
- Produces one verified reverse route and current maintenance documentation.

- [ ] **Step 1: Write the failing integration fixture**

Build temporary installations containing:

```text
osu!/
  osu!.Alice.cfg                  # Fullscreen=1, 1920x1080
  Skins/Fixture/skin.ini          # General + 1K/2K/3K/4K sections
  Skins/Fixture/assets/*@2x.png   # 8 receptors + 4 notes

Etterna/
  Save/Preferences.ini            # [Options] Theme=Rebirth
  Save/LocalProfiles/00000003/Etterna.xml
```

Use 4K values `HitPosition=436`, `ComboPosition=250`, `ScorePosition=280`, and four column
widths of `68`. Run the reader, conversion, and installer through
`convertAndInstallSkin`.

- [ ] **Step 2: Assert the complete output**

Verify:

- NoteSkin path uses General Name;
- all eight receptor and four note filenames contain `(doubleres)`;
- notes are byte-identical;
- receptors are square and only vertically normalized;
- static template files remain;
- profile ID is `00000004`;
- GUID matches `/^[0-9a-f]{16}$/` and differs from the existing GUID;
- `Editable.ini` and XML contain `Alice`;
- `Rebirth_settings/playerConfig.lua` contains `NoteFieldY=-3`, `ComboY=21`,
  `JudgmentY=40`, and `ReceptorSize=106`;
- no `assetsConfig.lua` or migrated judgement files are generated.

- [ ] **Step 3: Add overwrite and rollback integration cases**

Assert declining overwrite creates no new profile and leaves the NoteSkin unchanged.
Inject a profile-target promotion failure after NoteSkin promotion and assert the old
NoteSkin is restored and no profile/staging/backup remains.

- [ ] **Step 4: Run both direction integration tests**

Run:

```powershell
node --test tests/integration/etterna-to-osu.test.ts tests/integration/osu-to-etterna.test.ts
```

Expected: both routes pass; the existing forward fixture requires no semantic changes.

- [ ] **Step 5: Update current documentation**

Document:

- both supported directions and the 4K-only reverse scope;
- CFG selection and density rules;
- inverse position and width formulas;
- Etterna NoteSkin/profile target paths;
- excluded judgements, zoom, fonts, and LNs;
- multi-target atomic publication;
- placement rules for future source adapters, installers, and output-set publishers;
- prompt guidance requiring explicit overwrite confirmation and forward-route regression.

Do not rewrite historical plans/specifications.

- [ ] **Step 6: Audit real compatibility samples**

Run the parser and resolver read-only against representative installed osu! skins with:

- explicit `@2x` references;
- implicit high-resolution references;
- implicit standard-resolution references;
- mixed path casing.

Record unsupported patterns as concrete diagnostics or test fixtures. Do not write into the
real osu! or Etterna installations during the audit.

- [ ] **Step 7: Run full verification**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
```

Expected: every command exits `0`; both integration routes are green; no command invokes
`npm run test:trim-osu-receptor`.

- [ ] **Step 8: Review the worktree without committing**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

Separate the previously existing `package.json`, `.tmp`, template-reorganization, and
manual-script changes from this feature in the final report. Leave every file uncommitted
for user review in the IDE.
