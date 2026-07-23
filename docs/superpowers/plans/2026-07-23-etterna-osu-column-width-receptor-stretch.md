# Etterna-to-osu! Column Width and Receptor Stretch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read Etterna `ReceptorSize`, convert and render osu! `ColumnWidth`, and vertically
stretch receptor content using an isolated empirical calibration.

**Architecture:** The Etterna adapter reads source playfield data, the neutral model carries
`columnWidth`, the Etterna-to-osu! conversion translates units, and the osu! adapter owns the
visual calibration. Sharp applies only a generic vertical scale.

**Tech Stack:** TypeScript, luaparse, Sharp, Node.js test runner, Biome.

## Global Constraints

- Parse `playerConfig.lua` statically and never execute skin or profile Lua.
- Convert column width with `round(ReceptorSize - 38)`.
- Calibrate `46 -> 1` and `62 -> 211 / 146` with linear interpolation/extrapolation.
- Keep the three calibration values together and easy to edit.
- Preserve receptor width, horizontal centering, top anchoring, `@2x` names, and tap notes.
- Keep the user's current canvas factor of `3` pixels per hit-position point.
- Keep all changes unstaged and uncommitted for IDE review.

---

### Task 1: Read Column Width into the Neutral Model

**Files:**
- Modify: `src/domain/skin.ts`
- Modify: `src/adapters/etterna/profile/read-etterna-profile.test.ts`
- Modify: `src/adapters/etterna/profile/read-etterna-profile.ts`
- Modify: `src/adapters/etterna/reader/etterna-skin-reader.test.ts`
- Modify: `src/application/conversion/conversion-registry.test.ts`
- Modify: `src/application/conversion/convert-skin.test.ts`
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`

**Interfaces:**
- Produces: `PlayfieldConfiguration.columnWidth: number`
- Produces: `readEtternaProfile(gameRoot: string): Promise<PlayfieldConfiguration>` that
  explicitly selects `playerConfig.lua`.

- [x] **Step 1: Add failing parser and discovery tests**

Extend the returned Lua fixture with `ReceptorSize = 106` and expect:

```ts
assert.deepEqual(getGameplay4kCoordinates(ast), {
  hitPosition: -6,
  judgementPosition: 4.199984,
  comboPosition: -20.800002,
  columnWidth: 106,
})
```

Add a missing-property assertion:

```ts
assert.throws(
  () => getGameplay4kCoordinates(astWithoutReceptorSize),
  /Expected "ReceptorSize" to be a numeric value/,
)
```

Add an I/O test with an invalid `ignored.lua` and valid mixed-case `PLAYERCONFIG.LUA`; call
`readEtternaProfile(gameRoot)` and expect the valid configuration.

- [x] **Step 2: Run the profile tests and verify RED**

Run:

```sh
node --test src/adapters/etterna/profile/read-etterna-profile.test.ts
```

Expected: FAIL because `columnWidth` is missing and discovery still accepts any file.

- [x] **Step 3: Implement explicit static profile parsing**

Add `columnWidth` to the domain interface:

```ts
export interface PlayfieldConfiguration {
  hitPosition: number
  judgementPosition: number
  comboPosition: number
  columnWidth: number
}
```

Select only case-insensitive `playerConfig.lua` candidates, sort their absolute paths, and
use the first. Throw:

```ts
throw new Error(`Etterna playerConfig.lua was not found in ${profileDirectory}`)
```

Read top-level `ReceptorSize` with the existing numeric reader:

```ts
columnWidth: readNumber(rootTable, "ReceptorSize"),
```

- [x] **Step 4: Update typed fixtures and verify GREEN**

Add source widths to existing test models (`100` for Etterna fixtures, `62` for osu!
fixtures), then run:

```sh
node --test src/adapters/etterna/profile/read-etterna-profile.test.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts
npm run typecheck
```

Expected: profile and reader tests PASS and typecheck reports no missing `columnWidth`.

### Task 2: Convert and Render Column Width

**Files:**
- Create: `src/conversions/etterna-to-osu/convert-column-width.test.ts`
- Create: `src/conversions/etterna-to-osu/convert-column-width.ts`
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.ts`
- Modify: `src/templates/skin.ini`

**Interfaces:**
- Produces: `getColumnWidth(etternaReceptorSize: number): number`
- Consumes: converted `skin.playfield.columnWidth`
- Produces: `${column_width}` template replacement.

- [x] **Step 1: Add failing conversion tests**

Create:

```ts
test("converts and rounds Etterna receptor size to osu column width", () => {
  assert.equal(getColumnWidth(100), 62)
  assert.equal(getColumnWidth(101), 63)
  assert.equal(getColumnWidth(106), 68)
  assert.equal(getColumnWidth(100.5), 63)
})
```

Update the complete conversion test to expect `result.playfield.columnWidth === 62`.

- [x] **Step 2: Run conversion tests and verify RED**

Run:

```sh
node --test src/conversions/etterna-to-osu/convert-column-width.test.ts src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts
```

Expected: FAIL because the conversion function and model mapping do not exist.

- [x] **Step 3: Implement the conversion**

Use explicit equivalence constants:

```ts
const etternaDefaultReceptorSize = 100
const osuEquivalentColumnWidth = 62

export function getColumnWidth(etternaReceptorSize: number): number {
  return Math.round(
    osuEquivalentColumnWidth + (etternaReceptorSize - etternaDefaultReceptorSize),
  )
}
```

Map `columnWidth` beside `hitPosition` in `EtternaToOsuConversion`.

- [x] **Step 4: Add template rendering expectations**

Update the osu writer fixture template:

```ts
`Name: \${skin_name}\nHitPosition: \${hit_position}\nColumnWidth: \${column_width},\${column_width},\${column_width},\${column_width}\n`
```

Expect four converted values and replace the production template line with:

```ini
ColumnWidth: ${column_width},${column_width},${column_width},${column_width}
```

- [x] **Step 5: Pass column width through the writer and verify GREEN**

Add:

```ts
column_width: skin.playfield.columnWidth,
```

to template replacements and pass `columnWidth` to `writeOsuReceptors`. Run:

```sh
node --test src/conversions/etterna-to-osu/*.test.ts src/adapters/osu/writer/osu-skin-writer.test.ts
```

Expected: all focused conversion and writer tests PASS.

### Task 3: Calibrate and Apply Vertical Receptor Stretch

**Files:**
- Create: `src/adapters/osu/writer/osu-receptor-calibration.test.ts`
- Create: `src/adapters/osu/writer/osu-receptor-calibration.ts`
- Modify: `src/adapters/osu/writer/write-osu-receptors.test.ts`
- Modify: `src/adapters/osu/writer/write-osu-receptors.ts`
- Modify: `src/infrastructure/image/sharp-image-processor.test.ts`
- Modify: `src/infrastructure/image/sharp-image-processor.ts`

**Interfaces:**
- Produces: `getOsuReceptorVerticalScale(columnWidth: number): number`
- Adds: `RenderReceptorOptions.verticalScale: number`
- Adds: `WriteOsuReceptorsOptions.columnWidth: number`

- [x] **Step 1: Add failing calibration tests**

Create:

```ts
test("calculates the calibrated linear receptor scale", () => {
  assert.equal(getOsuReceptorVerticalScale(46), 1)
  assert.equal(getOsuReceptorVerticalScale(62), 211 / 146)
  assert.ok(Math.abs(getOsuReceptorVerticalScale(68) - 1.6121575342465753) < 1e-12)
})

test("rejects a non-positive extrapolated scale", () => {
  assert.throws(() => getOsuReceptorVerticalScale(10), /positive/)
})
```

- [x] **Step 2: Verify calibration RED, then implement isolated constants**

Run the new test and confirm the missing module failure. Implement:

```ts
const unstretchedColumnWidth = 46
const calibratedColumnWidth = 62
const calibratedVerticalScale = 211 / 146
```

Calculate the linear scale and throw when it is not positive.

- [x] **Step 3: Require the writer to pass scale and preserve canvas factor 3**

Update the writer test to pass `columnWidth: 62` and assert every render receives:

```ts
options.verticalScale === 211 / 146
options.pixelsPerHitPositionPoint === 3
```

Run the writer test and verify RED before importing and using
`getOsuReceptorVerticalScale`.

- [x] **Step 4: Add a failing image stretch test**

Create a `150 x 150` transparent receptor layer with alpha bounds `146 x 146`. Render with
`verticalScale: 211 / 146`, canvas factor `3`, and assert:

```ts
assert.deepEqual(alphaBounds(data, info.width, info.height), {
  left: 2,
  top: 0,
  right: 147,
  bottom: 210,
})
```

Also assert canvas metadata remains `150 x 374` for hit position `432`.

- [x] **Step 5: Implement generic vertical scaling**

Add required `verticalScale` to `RenderReceptorOptions`. After rotation and maximum-size
normalization, resize the normalized layer to:

```ts
{
  width: receptorMetadata.width,
  height: Math.round(receptorMetadata.height * options.verticalScale),
  fit: "fill",
}
```

Use the stretched layer's metadata for the canvas floor and composition. Add
`verticalScale: 1` to unrelated direct image tests.

- [x] **Step 6: Run focused tests and verify GREEN**

Run:

```sh
node --test src/adapters/osu/writer/osu-receptor-calibration.test.ts src/adapters/osu/writer/write-osu-receptors.test.ts src/infrastructure/image/sharp-image-processor.test.ts
```

Expected: calibration, propagation, stretch, canvas, and existing image tests PASS.

### Task 4: Complete Integration and Documentation

**Files:**
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: the complete reader -> conversion -> writer pipeline.
- Produces: end-to-end evidence for `ReceptorSize 100 -> ColumnWidth 62`.

- [x] **Step 1: Update the integration fixture and expectations**

Rename the profile fixture to `playerConfig.lua`, add `ReceptorSize = 100`, include the
column-width wildcard in its template, and expect:

```text
Name: Fixture Skin
HitPosition: 432
ColumnWidth: 62,62,62,62
```

Expect the receptor canvas to remain `150 x 374`. Inspect raw alpha and assert the original
`10 px` visible layer height becomes `14 px`, remains at `top: 0`, and retains its width.

- [x] **Step 2: Run integration and verify GREEN**

Run:

```sh
node --test tests/integration/etterna-to-osu.test.ts
```

Expected: PASS with converted width, stretched content, factor `3`, and `@2x` filename.

- [x] **Step 3: Update permanent documentation**

Document `ReceptorSize`, column-width conversion, calibration points, vertical-only stretch,
and the intentionally editable calibration module in README and architecture docs.

- [x] **Step 4: Run formatting and complete automated verification**

Run:

```sh
npx @biomejs/biome check --write src tests
npm run lint
npm test
npm run typecheck
npm run test:architecture
git diff --check
```

Expected: no formatting or lint findings, all tests pass, typecheck succeeds, dependency
rules pass, and no whitespace errors exist.

- [x] **Step 5: Run the real-skin image audit**

Analyze all `tmp` skins containing `NoteSkin.lua` and render their notes and receptors using
column width `62`, the calibrated vertical scale, and canvas factor `3`.

Expected: every analyzed asset renders without failure.

- [x] **Step 6: Leave all changes uncommitted**

Run `git status --short`. Do not stage or commit any file.
