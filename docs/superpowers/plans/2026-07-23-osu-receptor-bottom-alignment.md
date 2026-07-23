# osu! Receptor Hit-Position Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the approved receptor stretch while placing the visible receptor bottom at the calibrated visual position above osu!'s hit-position line.

**Architecture:** A target-specific osu! calibration module owns empirical values and exposes them through named functions. The osu! writer supplies the logical `480`-pixel gameplay height, converted column width, and calibrated logical vertical offset. The generic Sharp renderer converts the resulting logical bottom gap to source-image pixels, floors the canvas at visible height plus footer, and places the normalized visible layer immediately above that footer.

**Tech Stack:** TypeScript, Node.js test runner, Sharp, Biome, architecture boundary tests.

## Global Constraints

- Preserve `calibratedVerticalScale = 196 / 146` at osu! column width `62`.
- Preserve the current two-pixel receptor canvas change per hit-position point.
- Use `logicalCanvasHeight = 480` for osu!mania.
- Keep empirical stretch and alignment values in one named `receptorCalibration` object in `osu-receptor-calibration.ts`.
- Expose the calibrated logical vertical offset through a named function; do not inline `13` in the writer or renderer.
- Calculate `bottomPadding = round((logicalCanvasHeight - hitPosition + logicalBottomOffset) * canvasWidth / renderedWidth)`.
- For `HitPosition 432`, `ColumnWidth 62`, canvas width `150`, and logical offset `13`, produce `bottomPadding 148`.
- Preserve source width, transparent top rows, and transparent side margins while removing input-specific trailing transparent rows.
- Preserve all `@2x` names and note rendering.
- Do not stage or commit; the user will review the working tree in the IDE.

---

## File Structure

- `src/adapters/osu/writer/osu-receptor-calibration.ts`: owns named empirical stretch and alignment calibration.
- `src/adapters/osu/writer/osu-receptor-calibration.test.ts`: verifies target calibration values.
- `src/infrastructure/image/sharp-image-processor.ts`: owns generic logical-to-source footer conversion and composition.
- `src/infrastructure/image/sharp-image-processor.test.ts`: verifies footer arithmetic and real alpha bounds.
- `src/adapters/osu/writer/write-osu-receptors.ts`: supplies osu!'s logical height and target rendered width.
- `src/adapters/osu/writer/write-osu-receptors.test.ts`: verifies all target-specific render options.
- `tests/integration/etterna-to-osu.test.ts`: verifies the final receptor canvas and visible bounds.
- `readme.md`: documents the runtime mapping.
- `docs/architecture.md`: documents the target-adapter/infrastructure boundary.

### Task 1: Expose the Named osu! Alignment Calibration

**Files:**

- Modify: `src/adapters/osu/writer/osu-receptor-calibration.test.ts`
- Modify: `src/adapters/osu/writer/osu-receptor-calibration.ts`

- [ ] **Step 1: Write a failing calibration test**

Import `getOsuReceptorLogicalVerticalOffset` and assert that it returns `13`.

- [ ] **Step 2: Run the calibration test and verify RED**

Run:

```powershell
node --test src/adapters/osu/writer/osu-receptor-calibration.test.ts
```

Expected: FAIL because the named accessor does not exist.

- [ ] **Step 3: Centralize and expose the calibration**

Rename the existing calibration object to `receptorCalibration`, add
`logicalVerticalOffset: 13`, and export:

```ts
export function getOsuReceptorLogicalVerticalOffset(): number {
  return receptorCalibration.logicalVerticalOffset
}
```

- [ ] **Step 4: Run the calibration test and verify GREEN**

Run the focused test again and expect all calibration tests to pass.

### Task 2: Add Generic Offset-Aware Footer Geometry

**Files:**

- Modify: `src/infrastructure/image/sharp-image-processor.test.ts`
- Modify: `src/infrastructure/image/sharp-image-processor.ts`

**Interfaces:**

- Produces: `getReceptorBottomPadding(hitPosition: number, logicalCanvasHeight: number, canvasWidth: number, renderedWidth: number, logicalBottomOffset: number): number`.
- Changes: `getReceptorCanvasHeight(..., bottomPadding: number): number`.
- Adds to `RenderReceptorOptions`: `logicalBottomOffset: number`.

- [ ] **Step 1: Write failing footer arithmetic tests**

Import `getReceptorBottomPadding` and change the canvas test to:

```ts
test("calculates dynamic receptor footer and canvas height", () => {
  assert.equal(getReceptorBottomPadding(432, 480, 150, 62, 13), 148)
  assert.equal(getReceptorBottomPadding(438, 480, 150, 62, 13), 133)
  assert.equal(getReceptorBottomPadding(432, 480, 150, 68, 13), 135)

  assert.equal(getReceptorCanvasHeight(432, 356, 196, 438, 2, 148), 368)
  assert.equal(getReceptorCanvasHeight(438, 356, 196, 438, 2, 133), 356)
  assert.equal(getReceptorCanvasHeight(438, 100, 300, 438, 2, 148), 448)
})

test("rejects invalid dynamic-footer geometry", () => {
  assert.throws(() => getReceptorBottomPadding(432, 480, 150, 0, 13), /positive/)
  assert.throws(() => getReceptorBottomPadding(481, 480, 150, 62, 13), /between/)
})
```

- [ ] **Step 2: Run the image test and verify RED**

Run:

```powershell
node --test src/infrastructure/image/sharp-image-processor.test.ts
```

Expected: FAIL because `getReceptorBottomPadding` does not exist and
`getReceptorCanvasHeight` does not accept a footer.

- [ ] **Step 3: Implement the pure footer calculation**

Add:

```ts
export function getReceptorBottomPadding(
  hitPosition: number,
  logicalCanvasHeight: number,
  canvasWidth: number,
  renderedWidth: number,
  logicalBottomOffset: number,
): number {
  if (
    !Number.isFinite(hitPosition) ||
    !Number.isFinite(logicalCanvasHeight) ||
    !Number.isFinite(canvasWidth) ||
    !Number.isFinite(renderedWidth) ||
    !Number.isFinite(logicalBottomOffset) ||
    logicalCanvasHeight <= 0 ||
    canvasWidth <= 0 ||
    renderedWidth <= 0
  ) {
    throw new Error("Receptor footer dimensions must be finite and positive")
  }

  if (hitPosition < 0 || hitPosition > logicalCanvasHeight) {
    throw new Error(
      `Receptor hit position must be between 0 and ${logicalCanvasHeight}`,
    )
  }

  return Math.round(
    ((logicalCanvasHeight - hitPosition + logicalBottomOffset) * canvasWidth) /
      renderedWidth,
  )
}
```

- [ ] **Step 4: Add the footer to the canvas floor**

Change the signature and return expression:

```ts
export function getReceptorCanvasHeight(
  hitPosition: number,
  baseHeight: number,
  receptorHeight: number,
  referenceHitPosition: number,
  pixelsPerHitPositionPoint: number,
  bottomPadding: number,
): number {
  const adjustedHeight =
    baseHeight + (referenceHitPosition - hitPosition) * pixelsPerHitPositionPoint

  return Math.max(
    receptorHeight + bottomPadding,
    Math.round(adjustedHeight),
  )
}
```

- [ ] **Step 5: Add required render options**

Extend the interface:

```ts
export interface RenderReceptorOptions {
  hitPosition: number
  referenceHitPosition: number
  pixelsPerHitPositionPoint: number
  verticalScale: number
  logicalCanvasHeight: number
  renderedWidth: number
  baseImagePath: string
}
```

Add `logicalBottomOffset: 13` to every direct
`renderReceptorImage` test call so TypeScript can execute the focused test.

- [ ] **Step 6: Run the arithmetic tests and verify GREEN**

Run:

```powershell
node --test src/infrastructure/image/sharp-image-processor.test.ts
```

Expected: the new pure geometry tests PASS; existing pixel-position tests may still fail
until Task 3 changes composition.

### Task 3: Compose the Receptor Above the Calibrated Footer

**Files:**

- Modify: `src/infrastructure/image/sharp-image-processor.test.ts`
- Modify: `src/infrastructure/image/sharp-image-processor.ts`

**Interfaces:**

- Consumes: `getReceptorBottomPadding(...)`.
- Produces: visible receptor pixels immediately above a footer that becomes
  `logicalCanvasHeight - hitPosition` after target scaling.

- [ ] **Step 1: Change the neutral pixel expectation**

For the existing `146 x 146` visible fixture rendered at `HitPosition 432`,
`renderedWidth 62`, and scale `196 / 146`, assert:

```ts
assert.deepEqual({ width: info.width, height: info.height }, { width: 150, height: 368 })
assert.deepEqual(alphaBounds(data, info.width, info.height), {
  left: 2,
  top: 24,
  right: 147,
  bottom: 219,
})
```

The footer is `368 - 219 - 1 = 148`.

- [ ] **Step 2: Replace the physical-bottom invariant with a logical-hit-position test**

Render the same source at:

```ts
const cases = [
  { renderedWidth: 46, verticalScale: 1 },
  { renderedWidth: 62, verticalScale: 196 / 146 },
]
```

Use `hitPosition: 432`, `logicalCanvasHeight: 480`, `logicalBottomOffset: 13`,
and calculate for each output:

```ts
const bounds = alphaBounds(raw.data, raw.info.width, raw.info.height)
const footer = raw.info.height - bounds.bottom - 1
const logicalVisibleBottom =
  480 - (footer * renderedWidth) / raw.info.width

assert.ok(Math.abs(logicalVisibleBottom - (432 - 13)) < 0.2)
```

- [ ] **Step 3: Update existing direct renderer bounds**

All existing fixtures at `HitPosition 438`, `logicalCanvasHeight 480`,
`renderedWidth 62`, `logicalBottomOffset 13`, and canvas height `356` use footer `133`.
Preserve their width and
height assertions while changing alpha bounds to:

```ts
// 10-pixel visible height
{ top: 213, bottom: 222 }

// 20-pixel visible height
{ top: 203, bottom: 222 }

// 40-pixel visible height
{ top: 183, bottom: 222 }

// 50-pixel visible height
{ top: 173, bottom: 222 }
```

- [ ] **Step 4: Run the image test and verify RED**

Run:

```powershell
node --test src/infrastructure/image/sharp-image-processor.test.ts
```

Expected: pixel assertions FAIL because composition currently uses a zero-pixel footer.

- [ ] **Step 5: Apply footer geometry during rendering**

After reading `baseMetadata` and the trimmed visible receptor metadata, calculate:

```ts
const bottomPadding = getReceptorBottomPadding(
  options.hitPosition,
  options.logicalCanvasHeight,
  baseMetadata.width,
  options.renderedWidth,
  options.logicalBottomOffset,
)
```

Pass `bottomPadding` to `getReceptorCanvasHeight`, then compose with:

```ts
const top = canvasHeight - bottomPadding - receptorMetadata.height
```

Keep `removeTrailingTransparentRows` unchanged; it normalizes source-specific padding
before the exact target footer is added.

- [ ] **Step 6: Run the image tests and verify GREEN**

Run:

```powershell
node --test src/infrastructure/image/sharp-image-processor.test.ts
```

Expected: all image processor tests PASS.

### Task 4: Supply osu! Geometry and Verify Integration

**Files:**

- Modify: `src/adapters/osu/writer/write-osu-receptors.test.ts`
- Modify: `src/adapters/osu/writer/write-osu-receptors.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- Supplies: `logicalCanvasHeight: 480`, `renderedWidth: columnWidth`, and the
  named logical alignment calibration.
- Preserves: `pixelsPerHitPositionPoint: 2` and the existing calibrated vertical scale.

- [ ] **Step 1: Write failing writer-option assertions**

Add:

```ts
assert.ok(receivedOptions.every((options) => options.logicalCanvasHeight === 480))
assert.ok(receivedOptions.every((options) => options.renderedWidth === 62))
assert.ok(receivedOptions.every((options) => options.logicalBottomOffset === 13))
```

- [ ] **Step 2: Run the writer test and verify RED**

Run:

```powershell
node --test src/adapters/osu/writer/write-osu-receptors.test.ts
```

Expected: FAIL because the writer does not supply the new options.

- [ ] **Step 3: Supply target geometry from the osu! writer**

Add beside the existing canvas-factor constant:

```ts
const osuLogicalCanvasHeight = 480
```

Add to `renderOptions`:

```ts
logicalCanvasHeight: osuLogicalCanvasHeight,
renderedWidth: options.columnWidth,
logicalBottomOffset: getOsuReceptorLogicalVerticalOffset(),
```

- [ ] **Step 4: Run the writer test and verify GREEN**

Run:

```powershell
node --test src/adapters/osu/writer/write-osu-receptors.test.ts
```

Expected: all writer tests PASS.

- [ ] **Step 5: Update and run integration**

Keep the canvas at `150 x 368`. Change the expected visible bounds to:

```ts
{
  left: 65,
  top: 207,
  right: 84,
  bottom: 219,
}
```

Run:

```powershell
node --test tests/integration/etterna-to-osu.test.ts
```

Expected: PASS. The `13`-pixel visible fixture ends at row `219`, leaving the calibrated
`148`-pixel footer.

- [ ] **Step 6: Update documentation**

Update `readme.md` to state:

```markdown
The renderer preserves a transparent footer calculated from the logical `480`-pixel
playfield, converted hit position, output canvas width, column width, and a named osu!
alignment calibration. This keeps the visible receptor bottom at the calibrated position
above the hit-position line after osu! scales the key image.
```

Update `docs/architecture.md` to state:

```markdown
The osu! adapter supplies logical playfield height, rendered column width, and a logical
bottom offset from its calibration module. Image infrastructure converts that generic
geometry into source-pixel padding without embedding osu!-specific constants.
```

- [ ] **Step 7: Format and run complete verification**

Run:

```powershell
npx @biomejs/biome check --write src tests
npm run lint
npm test
npm run typecheck
npm run test:architecture
git diff --check
git status --short
```

Expected:

- Biome reports no errors or warnings.
- All tests pass.
- TypeScript reports no errors.
- Architecture boundaries contain no violations or cycles.
- Git reports no whitespace errors.
- The intended working tree remains unstaged and uncommitted.
