# Etterna to osu! Position Calibration Offsets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a fixed `-1` calibration to converted combo positions and a fixed `+1` calibration to converted hit positions.

**Architecture:** Keep the neutral game coordinates in `game-defaults.ts` unchanged. Each Etterna-to-osu! conversion module owns a named route-specific calibration offset, applies it after rounding, and returns the final integer consumed unchanged by the osu! writer.

**Tech Stack:** TypeScript, Node.js test runner, Biome.

## Global Constraints

- Preserve every unrelated staged, unstaged, and untracked change in the current worktree.
- Do not stage or commit files.
- Apply calibration after the existing one-to-one conversion and rounding.
- `ComboPosition = round(230 + ComboY) - 1`.
- `HitPosition = round(438 + NoteFieldY) + 1`.
- Do not change judgement position, zoom conversion, receptor rendering rules, templates, or global game defaults.

---

### Task 1: Calibrate combo position conversion

**Files:**
- Modify: `src/conversions/etterna-to-osu/convert-combo-position.test.ts`
- Modify: `src/conversions/etterna-to-osu/convert-combo-position.ts`

**Interfaces:**
- Consumes: `getComboPosition(etternaComboPosition: number): number`.
- Produces: a rounded osu! `ComboPosition` with a fixed `-1` calibration.

- [ ] **Step 1: Update the unit expectations before production code**

```ts
test("converts Etterna combo position with the osu calibration offset", () => {
  assert.equal(getComboPosition(0), 229)
  assert.equal(getComboPosition(-20), 209)
})

test("rounds before applying the combo calibration offset", () => {
  assert.equal(getComboPosition(-20.4), 209)
  assert.equal(getComboPosition(-20.6), 208)
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test src/conversions/etterna-to-osu/convert-combo-position.test.ts`

Expected: FAIL because the current results are `230`, `210`, `210`, and `209`.

- [ ] **Step 3: Add the owned named calibration constant**

```ts
const osuComboPositionCalibrationOffset = -1

export function getComboPosition(etternaComboPosition: number): number {
  const convertedPosition = Math.round(
    etternaComboPosition - gameDefaults.etterna.comboPosition + gameDefaults.osu.comboPosition,
  )

  return convertedPosition + osuComboPositionCalibrationOffset
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --test src/conversions/etterna-to-osu/convert-combo-position.test.ts`

Expected: both tests PASS.

### Task 2: Calibrate hit position conversion

**Files:**
- Modify: `src/conversions/etterna-to-osu/convert-hit-position.test.ts`
- Modify: `src/conversions/etterna-to-osu/convert-hit-position.ts`

**Interfaces:**
- Consumes: `getHitPosition(etternaHitPosition: number): number`.
- Produces: a rounded osu! `HitPosition` with a fixed `+1` calibration.

- [ ] **Step 1: Update the unit expectations before production code**

```ts
test("converts an Etterna hit position with the osu calibration offset", () => {
  assert.equal(getHitPosition(0), 439)
  assert.equal(getHitPosition(-6), 433)
})

test("rounds before applying the hit-position calibration offset", () => {
  assert.equal(getHitPosition(-6.6), 432)
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test src/conversions/etterna-to-osu/convert-hit-position.test.ts`

Expected: FAIL because the current results are `438`, `432`, and `431`.

- [ ] **Step 3: Add the owned named calibration constant**

```ts
const osuHitPositionCalibrationOffset = 1

export function getHitPosition(etternaHitPosition: number): number {
  const convertedPosition = Math.round(
    etternaHitPosition - gameDefaults.etterna.hitPosition + gameDefaults.osu.hitPosition,
  )

  return convertedPosition + osuHitPositionCalibrationOffset
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --test src/conversions/etterna-to-osu/convert-hit-position.test.ts`

Expected: both tests PASS.

### Task 3: Propagate calibrated values through conversion and output

**Files:**
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`

**Interfaces:**
- Consumes: calibrated `getComboPosition` and `getHitPosition` results.
- Produces: final `ComboPosition` and `HitPosition` values in the generated `skin.ini`.

- [ ] **Step 1: Update the conversion-level expectations**

For the existing `ComboY = -20` and `NoteFieldY = -6.6` fixture, use:

```ts
assert.equal(result.playfield.hitPosition, 432)
assert.equal(result.playfield.judgementPosition, 244)
assert.equal(result.playfield.comboPosition, 209)
```

- [ ] **Step 2: Update the integration output and receptor geometry expectations**

For the existing exact `NoteFieldY = -6` integration fixture, change only the calibrated
values and the receptor canvas geometry affected by `HitPosition = 433`:

```text
HitPosition: 433
ComboPosition: 209
ScorePosition: 244
```

```ts
assert.deepEqual(
  { width: receptor.info.width, height: receptor.info.height },
  { width: 150, height: 366 },
)
assert.deepEqual(alphaBounds(receptor.data, receptor.info.width, receptor.info.height), {
  left: 0,
  top: 96,
  right: 149,
  bottom: 196,
})
```

- [ ] **Step 3: Run conversion and integration tests**

Run:

```sh
node --test src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts tests/integration/etterna-to-osu.test.ts
```

Expected: both test files PASS while judgement and zoom expectations remain unchanged.

- [ ] **Step 4: Update the documented formulas**

Document that Etterna hit position `0` maps to osu!mania `439`, combo position `0` maps to
`229`, and use these formulas:

```text
HitPosition = round(438 + NoteFieldY) + 1
ComboPosition = round(230 + ComboY) - 1
ScorePosition = round(240 + JudgmentY)
```

- [ ] **Step 5: Run complete verification**

Run:

```sh
npm test
npm run typecheck
npm run lint
npm run test:architecture
git diff --check
```

Expected: every command exits successfully without changing the staging area.

