# osu! Receptor Canvas Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render osu! receptor canvases with two pixels of height change per osu! hit-position
point and emit every receptor with the `@2x` suffix.

**Architecture:** The osu! writer owns the target-specific two-pixel scale and passes it
through `RenderReceptorOptions`. The shared Sharp image processor applies the supplied scale
without an osu!-specific default. The osu! writer and static template share the exact
`@2x` receptor naming contract.

**Tech Stack:** TypeScript, Node.js test runner, Sharp, Biome.

## Global Constraints

- Keep receptors horizontally centered and anchored to the top.
- Never enlarge a source receptor and never make the canvas shorter than the rendered
  receptor.
- Emit only the eight `@2x` receptor files referenced by `skin.ini`.
- Leave tap-note rendering unchanged.
- Keep all implementation changes uncommitted until the user reviews them in the IDE.

---

### Task 1: Specify the Two-Pixel Scale

**Files:**
- Modify: `src/infrastructure/image/sharp-image-processor.test.ts`
- Modify: `src/adapters/osu/writer/write-osu-receptors.test.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`

**Interfaces:**
- Consumes: `getReceptorCanvasHeight(hitPosition, baseHeight, receptorHeight,
  referenceHitPosition, pixelsPerHitPositionPoint): number`
- Produces: failing tests for the generic scale, osu! ownership, and complete conversion
  output.

- [x] **Step 1: Update the image-processor expectations**

Change the linear-height assertions to supply the desired scale explicitly:

```ts
assert.equal(getReceptorCanvasHeight(432, 356, 20, 438, 2), 368)
assert.equal(getReceptorCanvasHeight(440, 356, 20, 438, 2), 352)
assert.equal(getReceptorCanvasHeight(600, 356, 80, 438, 2), 80)
```

- [x] **Step 2: Require the osu! writer to pass the scale**

Capture renderer options in the successful writer test:

```ts
const receivedOptions: RenderReceptorOptions[] = []

await writeOsuReceptors({
  receptors,
  outputDirectory,
  hitPosition: 438,
  baseImagePath: "base.png",
  render: async (_definition, options) => {
    receivedOptions.push(options)
    return Buffer.from("png")
  },
})

assert.equal(receivedOptions.length, 8)
assert.ok(receivedOptions.every((options) => options.pixelsPerHitPositionPoint === 2))
```

Import `RenderReceptorOptions` as a type from
`src/infrastructure/image/sharp-image-processor.ts`.

- [x] **Step 3: Update the integration expectation**

Change the generated receptor expectation:

```ts
assert.deepEqual(
  { width: receptor.width, height: receptor.height },
  { width: 150, height: 368 },
)
```

- [x] **Step 4: Run the focused tests and verify RED**

Run:

```sh
node --test src/infrastructure/image/sharp-image-processor.test.ts src/adapters/osu/writer/write-osu-receptors.test.ts tests/integration/etterna-to-osu.test.ts
```

Expected: FAIL because `getReceptorCanvasHeight` still uses the internal three-pixel scale,
the writer does not pass `pixelsPerHitPositionPoint`, and integration still produces a
`374 px` canvas.

### Task 2: Make the Scale Target-Owned

**Files:**
- Modify: `src/infrastructure/image/sharp-image-processor.ts`
- Modify: `src/adapters/osu/writer/write-osu-receptors.ts`

**Interfaces:**
- Consumes: `RenderReceptorOptions` from the image infrastructure.
- Produces: a required `pixelsPerHitPositionPoint: number` option and a generic
  five-argument `getReceptorCanvasHeight`.

- [x] **Step 1: Make the image processor consume an explicit scale**

Add the field:

```ts
export interface RenderReceptorOptions {
  hitPosition: number
  referenceHitPosition: number
  pixelsPerHitPositionPoint: number
  baseImagePath: string
}
```

Remove the module-level `pixelsPerHitPositionPoint` constant and change the function:

```ts
export function getReceptorCanvasHeight(
  hitPosition: number,
  baseHeight: number,
  receptorHeight: number,
  referenceHitPosition: number,
  pixelsPerHitPositionPoint: number,
): number {
  const adjustedHeight =
    baseHeight + (referenceHitPosition - hitPosition) * pixelsPerHitPositionPoint
  return Math.max(receptorHeight, Math.round(adjustedHeight))
}
```

Pass `options.pixelsPerHitPositionPoint` as the fifth argument from
`renderReceptorImage`.

- [x] **Step 2: Define the osu!-specific scale in the writer**

Add this private module constant to `write-osu-receptors.ts`:

```ts
const osuReceptorCanvasPixelsPerHitPositionPoint = 2
```

Include it in the render options:

```ts
const renderOptions: RenderReceptorOptions = {
  hitPosition: options.hitPosition,
  referenceHitPosition: gameDefaults.osu.hitPosition,
  pixelsPerHitPositionPoint: osuReceptorCanvasPixelsPerHitPositionPoint,
  baseImagePath: options.baseImagePath,
}
```

- [x] **Step 3: Run the focused tests and verify GREEN**

Run:

```sh
node --test src/infrastructure/image/sharp-image-processor.test.ts src/adapters/osu/writer/write-osu-receptors.test.ts tests/integration/etterna-to-osu.test.ts
```

Expected: all focused tests PASS.

### Task 3: Add the `@2x` Receptor Naming Contract

**Files:**
- Modify: `src/adapters/osu/writer/write-osu-receptors.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Modify: `src/adapters/osu/templates/render-osu-template.test.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `src/adapters/osu/writer/write-osu-receptors.ts`
- Modify: `src/templates/skin.ini`

**Interfaces:**
- Consumes: direction and receptor-state output naming in `writeOsuReceptors`.
- Produces: exactly eight `@2x.png` receptor assets and matching extensionless `KeyImage`
  paths in the osu! template.

- [x] **Step 1: Update writer and integration tests**

Change the writer's expected filenames to:

```ts
assert.deepEqual(names.sort(), [
  "down@2x.png",
  "down_tap@2x.png",
  "left@2x.png",
  "left_tap@2x.png",
  "right@2x.png",
  "right_tap@2x.png",
  "up@2x.png",
  "up_tap@2x.png",
])
```

Update `osu-skin-writer.test.ts` and the integration test to read
`mania/receptors/left@2x.png`. In integration, also prove that the old name is absent:

```ts
await assert.rejects(
  () => readFile(path.join(outputDirectory, "mania", "receptors", "left.png")),
  { code: "ENOENT" },
)
```

- [x] **Step 2: Add an exact template contract test**

Read `src/templates/skin.ini`, extract trimmed lines beginning with `KeyImage`, and assert:

```ts
assert.deepEqual(receptorLines, [
  "KeyImage0: mania\\receptors\\left@2x",
  "KeyImage0D: mania\\receptors\\left_tap@2x",
  "KeyImage1: mania\\receptors\\down@2x",
  "KeyImage1D: mania\\receptors\\down_tap@2x",
  "KeyImage2: mania\\receptors\\up@2x",
  "KeyImage2D: mania\\receptors\\up_tap@2x",
  "KeyImage3: mania\\receptors\\right@2x",
  "KeyImage3D: mania\\receptors\\right_tap@2x",
])
```

- [x] **Step 3: Run the focused tests and verify RED**

Run:

```sh
node --test src/adapters/osu/writer/write-osu-receptors.test.ts src/adapters/osu/writer/osu-skin-writer.test.ts src/adapters/osu/templates/render-osu-template.test.ts tests/integration/etterna-to-osu.test.ts
```

Expected: FAIL because the writer still emits unsuffixed names and the template still
references them.

- [x] **Step 4: Implement the shared `@2x` contract**

Change the prepared receptor filename in `write-osu-receptors.ts`:

```ts
filename: `${direction}${state === "pressed" ? "_tap" : ""}@2x.png`,
```

Change `KeyImage0` through `KeyImage3D` in `src/templates/skin.ini` to the exact paths from
Step 2.

- [x] **Step 5: Run the focused tests and verify GREEN**

Run the same focused command from Step 3.

Expected: all focused tests PASS.

### Task 4: Document and Verify the Result

**Files:**
- Modify: `readme.md`

**Interfaces:**
- Consumes: the implemented two-pixel osu! scale.
- Produces: accurate user-facing behavior documentation and complete verification evidence.

- [x] **Step 1: Update the README**

Replace the old ratio with:

```text
The receptor canvas changes linearly with the converted hit position: each one osu! hit
position point removed adds two pixels of height, and the inverse change reduces the canvas.
```

Keep the following statement about the top anchor and receptor-height floor.

- [x] **Step 2: Format and lint**

Run:

```sh
npx @biomejs/biome check --write src tests
npm run lint
```

Expected: both commands complete without errors or warnings.

- [x] **Step 3: Run complete automated verification**

Run:

```sh
npm test
npm run typecheck
npm run test:architecture
git diff --check
```

Expected: all tests pass, type checking succeeds, architecture has no forbidden dependency or
cycle, and the diff contains no whitespace errors.

- [x] **Step 4: Run the real-skin rendering audit**

Load every skin under `tmp` that contains `NoteSkin.lua`, analyze its receptors and notes,
and render all resolved assets using the `2` pixel scale.

Expected: all skins that contain `NoteSkin.lua` analyze successfully and every resolved
asset renders without an image-processing failure.

- [x] **Step 5: Leave the implementation uncommitted**

Run:

```sh
git status --short
```

Expected: the receptor-scale implementation and documentation remain visible for IDE review;
do not stage or commit them.
