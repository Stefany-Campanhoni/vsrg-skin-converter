# osu! to Etterna Resized Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate osu!-derived Etterna tap notes at exactly 150×150 pixels and receptors at exactly 146×146 pixels, with every generated filename ending in ` (res 64x64).png`.

**Architecture:** A generic infrastructure image operation performs exact fill resizing. The Etterna writer adapter owns target-specific filename and geometry constants, composes note resizing and receptor normalization in the approved order, and keeps source-density selection isolated in the osu! reader/resolver.

**Tech Stack:** TypeScript 7, Node.js 22 test runner, Sharp 0.35, Biome, existing `settleAll`/`invokeAsPromise` concurrency utilities.

## Global Constraints

- Change only the osu!mania-to-Etterna conversion; Etterna-to-osu! behavior remains unchanged.
- Every generated tap note is exactly 150×150 physical pixels.
- Every generated receptor is exactly 146×146 physical pixels.
- Exact resizing uses fill semantics and does not preserve source aspect ratio.
- Every generated reverse note and receptor ends with ` (res 64x64).png`; neither uses ` (doubleres)`.
- Source SD/`@2x` selection remains unchanged and does not influence the Etterna output filename.
- Receptors keep the order: trim vertical transparency, stretch to source-width square, then resize to 146×146.
- Never trim lateral transparent columns.
- A transparent normal receptor becomes a transparent 146×146 PNG.
- A transparent pressed receptor reuses the processed 146×146 normal receptor from the same direction.
- Preserve exact lower-level errors as `cause` and keep concurrent batches quiescent.
- Do not add reverse judgements, long notes, fonts, or combo zoom.
- Preserve all existing uncommitted work; do not touch `.tmp/` or `src/scripts/trim-osu-receptor.ts`.
- Do not stage, commit, push, or run `npm run test:trim-osu-receptor`.

---

### Task 1: Add Generic Exact PNG Resizing

**Files:**
- Create: `src/infrastructure/image/resize-image-exact.ts`
- Create: `src/infrastructure/image/resize-image-exact.test.ts`

**Interfaces:**
- Consumes: encoded PNG `Buffer` and a readonly `{ width: number; height: number }` target.
- Produces: `resizeImageExact(image: Buffer, size: ExactImageSize): Promise<Buffer>`.

- [ ] **Step 1: Write failing geometry, transparency, validation, and cause tests**

Create valid Sharp fixtures. Prove that a non-square `20×10` solid PNG becomes `150×150`,
a transparent PNG remains transparent at the requested dimensions, invalid dimensions reject
before decoding, and an invalid encoded buffer is retained as the cause of the contextual error.

```ts
const resized = await resizeImageExact(source, { width: 150, height: 150 })
assert.deepEqual(await imageSize(resized), { width: 150, height: 150 })

await assert.rejects(
  () => resizeImageExact(Buffer.from("invalid"), { width: 146, height: 146 }),
  (error) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /resize image.*146.*146/i)
    assert.ok(error.cause instanceof Error)
    return true
  },
)
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```powershell
node --test src/infrastructure/image/resize-image-exact.test.ts
```

Expected: FAIL because `resize-image-exact.ts` does not exist.

- [ ] **Step 3: Implement exact fill resizing with target validation**

Implement the complete public contract:

```ts
import sharp from "sharp"

export interface ExactImageSize {
  readonly width: number
  readonly height: number
}

export async function resizeImageExact(image: Buffer, size: ExactImageSize): Promise<Buffer> {
  assertPositiveInteger(size.width, "width")
  assertPositiveInteger(size.height, "height")
  try {
    return await sharp(image)
      .resize({ width: size.width, height: size.height, fit: "fill" })
      .png()
      .toBuffer()
  } catch (cause) {
    throw new Error(`Could not resize image to ${size.width}x${size.height}`, { cause })
  }
}
```

Keep `assertPositiveInteger` private and reject zero, negative, fractional, `NaN`, and infinite
dimensions with the field name in the message.

- [ ] **Step 4: Run focused and infrastructure tests**

Run:

```powershell
node --test src/infrastructure/image/resize-image-exact.test.ts src/infrastructure/image/normalize-osu-receptor.test.ts
npm run typecheck
```

Expected: PASS with no changes to receptor normalization behavior.

- [ ] **Step 5: Review the Task 1 delta without committing**

Verify that the infrastructure module contains no Etterna-specific size or filename constant.

---

### Task 2: Define the Fixed Etterna Output Policy

**Files:**
- Create: `src/adapters/etterna/writer/etterna-output-asset-policy.ts`
- Create: `src/adapters/etterna/writer/etterna-output-asset-policy.test.ts`
- Delete: `src/adapters/etterna/writer/etterna-asset-filename.ts`
- Delete: `src/adapters/etterna/writer/etterna-asset-filename.test.ts`
- Modify: `src/adapters/etterna/writer/write-etterna-notes.ts`
- Modify: `src/adapters/etterna/writer/write-etterna-notes.test.ts`
- Modify: `src/adapters/etterna/writer/write-etterna-receptors.ts`
- Modify: `src/adapters/etterna/writer/write-etterna-receptors.test.ts`

**Interfaces:**
- Consumes: an Etterna logical asset name only.
- Produces: `getEtternaOutputAssetFilename(logicalName: string): string`,
  `etternaTapNoteOutputSize`, and `etternaReceptorOutputSize`.

- [ ] **Step 1: Write failing fixed-policy tests**

Assert exact values independent of source density:

```ts
assert.equal(
  getEtternaOutputAssetFilename("_Left Tap Note"),
  "_Left Tap Note (res 64x64).png",
)
assert.deepEqual(etternaTapNoteOutputSize, { width: 150, height: 150 })
assert.deepEqual(etternaReceptorOutputSize, { width: 146, height: 146 })
```

Update writer filename expectations so mixed `standard`, `double`, and missing
`pixelDensity` inputs all produce the same fixed decoration. Remove tests that expect a
missing-density rejection; replace them with successful no-density cases.

- [ ] **Step 2: Run the policy and writer tests and observe RED**

Run:

```powershell
node --test src/adapters/etterna/writer/etterna-output-asset-policy.test.ts src/adapters/etterna/writer/write-etterna-notes.test.ts src/adapters/etterna/writer/write-etterna-receptors.test.ts
```

Expected: FAIL because the old helper emits density-dependent names and writers require
`pixelDensity`.

- [ ] **Step 3: Implement the adapter-owned policy**

Create:

```ts
const etternaLogicalResolutionDecoration = " (res 64x64)"

export const etternaTapNoteOutputSize = { width: 150, height: 150 } as const
export const etternaReceptorOutputSize = { width: 146, height: 146 } as const

export function getEtternaOutputAssetFilename(logicalName: string): string {
  return `${logicalName}${etternaLogicalResolutionDecoration}.png`
}
```

Update both writers to call the new function with only the logical name. Remove
`ImageDensity`, `pixelDensity` from local writer source types, and both
`requirePixelDensity` functions. Do not remove density from `ImageAsset` or change osu!
asset resolution.

- [ ] **Step 4: Delete the superseded helper and run focused checks**

Run:

```powershell
node --test src/adapters/etterna/writer/etterna-output-asset-policy.test.ts src/adapters/etterna/writer/write-etterna-notes.test.ts src/adapters/etterna/writer/write-etterna-receptors.test.ts
npm run typecheck
npm run test:architecture
```

Expected: fixed names pass for every density combination; architecture remains green.

- [ ] **Step 5: Review the Task 2 delta without committing**

Confirm `doubleres` no longer appears in generated note/receptor filename code and source
density continues to exist in the resolver/reader.

---

### Task 3: Resize Every Migrated Tap Note to 150×150

**Files:**
- Modify: `src/adapters/etterna/writer/write-etterna-notes.ts`
- Modify: `src/adapters/etterna/writer/write-etterna-notes.test.ts`
- Modify: `src/adapters/etterna/writer/etterna-note-skin-writer.test.ts`

**Interfaces:**
- Consumes: `resizeImageExact` and `etternaTapNoteOutputSize` from Tasks 1 and 2.
- Produces: `prepareEtternaNotes` assets whose buffers are encoded 150×150 PNGs.

- [ ] **Step 1: Replace byte-copy expectations with failing image assertions**

Use four valid, non-square, solid-color PNG fixtures with mixed/missing density metadata.
Assert exact output dimensions, direction-specific RGBA values, and fixed filenames.

```ts
const metadata = await sharp(outputPath).metadata()
assert.deepEqual(
  { width: metadata.width, height: metadata.height },
  { width: 150, height: 150 },
)
```

Add an injected-resizer failure test with one deferred sibling. Assert all four resize
operations start, the returned Promise remains pending until the deferred sibling settles,
no writes start, the message identifies direction/source path, and `error.cause` is the
exact injected failure.

- [ ] **Step 2: Run note-writer tests and observe RED**

Run:

```powershell
node --test src/adapters/etterna/writer/write-etterna-notes.test.ts src/adapters/etterna/writer/etterna-note-skin-writer.test.ts
```

Expected: FAIL because note buffers are still copied without resizing.

- [ ] **Step 3: Add a quiescent resize phase**

Add an injectable resize dependency:

```ts
type AssetResizer = typeof resizeImageExact

export interface PrepareEtternaNotesOptions {
  notes: TapNoteSet
  read?: AssetReader
  resize?: AssetResizer
}
```

Keep reads as the first `settleAll` batch. After all reads succeed, start one contextual
resize operation per direction in a second `settleAll` batch:

```ts
runEtternaAssetOperation(
  `resize osu!-derived Etterna tap note for ${direction} from '${definition.filePath}' to 150x150`,
  () => resize(buffer, etternaTapNoteOutputSize),
)
```

Build each `PreparedEtternaAsset` only from the resized buffer. Do not start the write phase
if any resize fails.

- [ ] **Step 4: Run note and writer-composition checks**

Run:

```powershell
node --test src/adapters/etterna/writer/write-etterna-notes.test.ts src/adapters/etterna/writer/etterna-note-skin-writer.test.ts
npm run typecheck
npm run lint
```

Expected: every generated note is a fixed-name 150×150 PNG; failure tests remain quiescent.

- [ ] **Step 5: Review the Task 3 delta without committing**

Confirm no frame rotation or transparent trimming was added to the tap-note path.

---

### Task 4: Apply the Final 146×146 Receptor Resize

**Files:**
- Modify: `src/adapters/etterna/writer/write-etterna-receptors.ts`
- Modify: `src/adapters/etterna/writer/write-etterna-receptors.test.ts`
- Modify: `src/adapters/etterna/writer/etterna-note-skin-writer.test.ts`
- Test: `src/infrastructure/image/normalize-osu-receptor.test.ts`

**Interfaces:**
- Consumes: existing `normalizeOsuReceptorImage`, Task 1 `resizeImageExact`, and Task 2
  `etternaReceptorOutputSize`.
- Produces: eight fixed-name, encoded 146×146 receptor PNG buffers.

- [ ] **Step 1: Write failing final-size and transformation-order tests**

Strengthen the receptor fixtures with visible pixels surrounded by vertical and lateral
transparency. Assert all eight outputs are 146×146, lateral alpha proportions survive the
vertical-only trim/square stage, and unique solid RGBA content remains bound to each
direction/state.

Replace transparent-normal byte-identity with:

```ts
assert.deepEqual(await imageSize(normal), { width: 146, height: 146 })
assert.equal(await isImageFullyTransparent(normal), true)
```

For transparent pressed, assert both files exist under fixed names, both are 146×146, and
their encoded buffers are identical because pressed reuses processed normal.

Add an injected final-resizer failure with deferred sibling assertions. The message must
include `resize`, direction, state, source path, and `146x146`; `cause` must be exact; no
writes may start.

- [ ] **Step 2: Run receptor tests and observe RED**

Run:

```powershell
node --test src/adapters/etterna/writer/write-etterna-receptors.test.ts src/infrastructure/image/normalize-osu-receptor.test.ts
```

Expected: FAIL because normalization currently stops at source-width square dimensions and
transparent normal returns the original dimensions.

- [ ] **Step 3: Compose normalization and exact resizing in the adapter**

Add `resize?: typeof resizeImageExact` to receptor preparation options. Preserve the
existing normal/pressed transparency batch and process visible receptors as:

```ts
const square = await normalize(buffer)
return resize(square, etternaReceptorOutputSize)
```

Process a transparent normal as `resize(originalBuffer, etternaReceptorOutputSize)` so the
result is transparent 146×146. If pressed is transparent, reuse the Promise/result for the
processed normal; do not normalize or resize pressed independently. If pressed is visible,
normalize and resize it independently.

Wrap normalization and final resizing as separate `runEtternaAssetOperation` calls so the
error identifies the failing stage and preserves the exact cause. Use `settleAll` for
normal and pressed processing and preserve input-order failure selection.

- [ ] **Step 4: Run receptor and composed-writer checks**

Run:

```powershell
node --test src/adapters/etterna/writer/write-etterna-receptors.test.ts src/adapters/etterna/writer/etterna-note-skin-writer.test.ts src/infrastructure/image/normalize-osu-receptor.test.ts
npm run typecheck
npm run lint
```

Expected: all eight outputs are fixed-name 146×146 PNGs; transparency and fallback tests
pass; infrastructure normalization still independently proves vertical-only trim followed
by source-width square.

- [ ] **Step 5: Review the Task 4 delta without committing**

Confirm game-specific dimensions are imported from the Etterna adapter policy and are not
hard-coded in infrastructure.

---

### Task 5: Update End-to-End Proof and Current Documentation

**Files:**
- Modify: `tests/integration/osu-to-etterna.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`
- Modify: `docs/development-standards.md`
- Modify: `docs/agent-prompt-guidelines.md`

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: current integration proof and maintenance documentation for the new contract.

- [ ] **Step 1: Update the reverse integration fixture expectations**

Replace every generated note/receptor `(doubleres)` path with `(res 64x64)`. Assert the
Notes directory contains exactly four fixed names and the Receptors directory exactly eight.
Assert notes are 150×150 and receptors 146×146. Preserve the unique RGBA assertions proving
lane/state source selection and retain the high-resolution CFG fixture proving `@2x` source
selection.

Update authorized-overwrite assertions to use the new filenames. Restrict any remaining
`doubleres` fixture references to static template assets that are outside generated Notes
and Receptors.

- [ ] **Step 2: Run both integration directions and observe RED before expectation completion**

Run:

```powershell
node --test tests/integration/etterna-to-osu.test.ts tests/integration/osu-to-etterna.test.ts
```

Expected during the test-edit cycle: reverse assertions fail until every old generated name
and geometry expectation is replaced. Final expected result: both directions PASS.

- [ ] **Step 3: Update current documentation**

Document:

- fixed ` (res 64x64)` reverse note/receptor names;
- 150×150 notes;
- receptor order `vertical trim → width square → 146×146`;
- transparent normal and pressed fallback behavior;
- source density selects input only;
- placement of future game-specific output calibrations in the target adapter;
- prompt guidance requiring exact dimensions, transformation order, and both-direction
  regression tests.

Do not rewrite historical plans or specifications.

- [ ] **Step 4: Run the full verification matrix**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
```

Expected: every command exits `0`; no command invokes the manual trim script.

- [ ] **Step 5: Audit the final worktree without committing**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

Separate this change from pre-existing `.tmp`, manual-script, template-reorganization, and
other uncommitted work in the handoff. Leave every file unstaged and uncommitted for IDE
review.
