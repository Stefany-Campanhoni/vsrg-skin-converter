# Etterna Gameplay Zoom Implementation Plan

> Historical note: the initial `0.5` judgement influence documented in this plan was
> superseded by `2026-08-03-judgement-zoom-calibration.md`. The current authoritative formula
> is `1 + (JudgmentZoom - 1) * 0.75`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Etterna 4K `JudgmentZoom` and `ComboZoom` settings into resized osu!mania judgement and combo-number images.

**Architecture:** The Etterna profile adapter turns source-specific zoom controls into neutral `comboScale` and `judgementScale` factors on `PlayfieldConfiguration`. The osu! writer consumes only those factors: its judgement writer renders scaled variants and a focused combo writer scales copied `score-*.png` template assets. Generic proportional PNG resizing remains in image infrastructure.

**Tech Stack:** TypeScript, Node.js test runner, `luaparse`, Sharp, Biome.

## Global Constraints

- Parse `playerConfig.lua` statically; never execute it.
- Read `GameplaySizes["4K"].JudgmentZoom` and `.ComboZoom` as required numeric fields.
- `ComboZoom` is the direct output scale; `JudgmentZoom` maps to `1 + (zoom - 1) * 0.5`.
- Preserve aspect ratio, round dimensions, and clamp each to at least one pixel.
- The neutral model exposes `comboScale` and `judgementScale`; the osu! writer must not parse Etterna settings.
- Resize `score-0.png` through `score-9.png` and every matching `@2x` variant after template copying.
- Do not alter `skin.ini` for these settings.
- Keep all existing local changes intact and do not create a commit.
- Finish with `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`, and `git diff --check`.

---

## File structure

- `src/domain/skin.ts`: neutral scale-factor fields shared by readers, conversions, and writers.
- `src/adapters/etterna/profile/read-etterna-profile.ts`: 4K size-table parsing and source zoom normalization.
- `src/infrastructure/image/resize-image.ts`: generic buffer-to-buffer proportional PNG resizing.
- `src/adapters/osu/writer/write-osu-judgements.ts`: supply the neutral judgement scale to image rendering.
- `src/infrastructure/image/sharp-judgement-processor.ts`: render density-aware scaled judgement variants.
- `src/adapters/osu/writer/write-osu-combo-images.ts`: resize copied osu! score-font assets.
- `src/adapters/osu/writer/osu-skin-writer.ts`: coordinate combo and judgement image writing.

### Task 1: Parse source zooms into neutral scale factors

**Files:**

- Modify: `src/domain/skin.ts`
- Modify: `src/adapters/etterna/profile/read-etterna-profile.ts`
- Modify: `src/adapters/etterna/profile/read-etterna-profile.test.ts`
- Modify: `src/adapters/etterna/reader/etterna-skin-reader.test.ts`
- Modify: `src/application/conversion/conversion-registry.test.ts`
- Modify: `src/application/conversion/convert-skin.test.ts`
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Modify: `src/adapters/osu/writer/write-osu-receptors.test.ts`

**Interfaces:**

- Produces `PlayfieldConfiguration.comboScale: number` and `PlayfieldConfiguration.judgementScale: number`.
- Later tasks consume these values unchanged after conversion.

- [ ] **Step 1: Write the failing profile parser tests**

Extend the representative Lua fixture with:

```lua
GameplaySizes = {
  ["4K"] = { JudgmentZoom = 0.35, ComboZoom = 0.6 },
},
```

Assert `judgementScale: 0.675` and `comboScale: 0.6`. Add a missing `GameplaySizes["4K"]` assertion that expects `Expected GameplaySizes["4K"] to be a Lua table`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/adapters/etterna/profile/read-etterna-profile.test.ts`

Expected: FAIL because the parser returns no scale fields.

- [ ] **Step 3: Implement the source parsing and model fields**

Add both fields to `PlayfieldConfiguration`. In `getGameplay4kCoordinates`, use existing table helpers to require `GameplaySizes` and `GameplaySizes["4K"]`, then calculate:

```ts
const judgementZoom = readNumber(sizes4k, "JudgmentZoom")
const comboZoom = readNumber(sizes4k, "ComboZoom")

judgementScale: 1 + (judgementZoom - 1) * 0.5,
comboScale: comboZoom,
```

Add `comboScale: 1` and `judgementScale: 1` to every test `SkinModel` and profile dependency stub. Keep the conversion's spread so it preserves both factors.

- [ ] **Step 4: Verify parser, reader, conversion, and types**

Run: `node --test src/adapters/etterna/profile/read-etterna-profile.test.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts && npm run typecheck`

Expected: PASS.

### Task 2: Add generic proportional PNG resizing

**Files:**

- Create: `src/infrastructure/image/resize-image.ts`
- Create: `src/infrastructure/image/resize-image.test.ts`

**Interfaces:**

- Produces `resizeImageProportionally(image: Buffer, scale: number): Promise<Buffer>`.
- Consumes an encoded image and a positive finite scale.

- [ ] **Step 1: Write the failing resize test**

Create a generated `10 × 6` RGBA PNG. Assert `0.6` produces `6 × 4`, `0.01` produces `1 × 1`, alpha is preserved, and invalid scale rejects:

```ts
await assert.rejects(() => resizeImageProportionally(image, 0), /positive finite/i)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/infrastructure/image/resize-image.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the utility**

Use Sharp metadata to require width and height, reject non-positive/non-finite scales, calculate `Math.max(1, Math.round(dimension * scale))`, and return:

```ts
sharp(image)
  .resize({ width, height, fit: "fill", kernel: sharp.kernel.lanczos3 })
  .ensureAlpha()
  .png()
  .toBuffer()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/infrastructure/image/resize-image.test.ts`

Expected: PASS.

### Task 3: Render scaled judgement variants

**Files:**

- Modify: `src/infrastructure/image/sharp-judgement-processor.ts`
- Modify: `src/infrastructure/image/sharp-judgement-processor.test.ts`
- Modify: `src/adapters/osu/writer/write-osu-judgements.ts`
- Modify: `src/adapters/osu/writer/write-osu-judgements.test.ts`

**Interfaces:**

- `renderJudgementImageVariants(definition, sourceDensity, scale)` receives the neutral scale.
- `JudgementRenderer` receives `(definition, sourceDensity, scale)`.
- `WriteOsuJudgementsOptions` receives `scale: number`.

- [ ] **Step 1: Write failing scaled judgement tests**

For an extracted `6 × 4` standard-density frame at scale `0.675`, assert SD `4 × 3` and HD `8 × 5`. For a `9 × 7` double-density frame at the same scale, assert SD `3 × 2` and HD `6 × 5`. Update writer tests to observe the supplied scale for each grade.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/infrastructure/image/sharp-judgement-processor.test.ts src/adapters/osu/writer/write-osu-judgements.test.ts`

Expected: FAIL because the renderer and writer do not accept a scale.

- [ ] **Step 3: Implement density-aware dimensions**

Retain selected-frame extraction. Derive dimensions from the original source with `standardScale = scale / sourceDensity` and `doubleScale = (scale * 2) / sourceDensity`, using the Task 2 rounding contract. Pass `options.scale` to each renderer call. Scale `1` preserves current output.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/infrastructure/image/sharp-judgement-processor.test.ts src/adapters/osu/writer/write-osu-judgements.test.ts`

Expected: PASS.

### Task 4: Resize copied combo assets and integrate the writer

**Files:**

- Create: `src/adapters/osu/writer/write-osu-combo-images.ts`
- Create: `src/adapters/osu/writer/write-osu-combo-images.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- Produces `writeOsuComboImages({ outputDirectory, scale }): Promise<void>`.
- `OsuSkinWriter` invokes it after `copyDirectory` with `skin.playfield.comboScale` and supplies `skin.playfield.judgementScale` to `writeOsuJudgements`.

- [ ] **Step 1: Write failing combo and integration tests**

Generate all twenty template files (`score-0.png` through `score-9.png` and their `@2x` versions). Assert a `10 × 6` SD image becomes `6 × 4`, while a `20 × 12` HD image becomes `12 × 7` at scale `0.6`. In the integration profile, set `JudgmentZoom = 0.35` and `ComboZoom = 0.6`; assert scaled judgement and score dimensions in the converted output.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/adapters/osu/writer/write-osu-combo-images.test.ts src/adapters/osu/writer/osu-skin-writer.test.ts tests/integration/etterna-to-osu.test.ts`

Expected: FAIL because the combo writer does not exist and the full writer does not call it.

- [ ] **Step 3: Implement score-font publishing**

Define the twenty exact score filenames in the osu! adapter. For every copied image, read it, call `resizeImageProportionally`, and overwrite it. Start all operations through `settleAll` so failures wait for every sibling. Add this writer to `OsuSkinWriter`'s existing task batch. Document the two source fields, scale rules, and image-based output behavior.

- [ ] **Step 4: Run focused behavior tests**

Run: `node --test src/adapters/etterna/profile/read-etterna-profile.test.ts src/infrastructure/image/resize-image.test.ts src/infrastructure/image/sharp-judgement-processor.test.ts src/adapters/osu/writer/write-osu-combo-images.test.ts src/adapters/osu/writer/write-osu-judgements.test.ts src/adapters/osu/writer/osu-skin-writer.test.ts tests/integration/etterna-to-osu.test.ts`

Expected: PASS.

- [ ] **Step 5: Run required verification without committing**

Run: `npm test; npm run typecheck; npm run lint; npm run test:architecture; git diff --check`

Expected: every command exits with status 0. Do not commit.
