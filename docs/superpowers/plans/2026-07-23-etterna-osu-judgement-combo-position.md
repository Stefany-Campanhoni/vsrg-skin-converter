# Etterna-to-osu! Judgement and Combo Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Etterna 4K `JudgmentY` and `ComboY` into rounded osu!mania `ScorePosition` and `ComboPosition` values and render them into the generated `skin.ini`.

**Architecture:** Two focused pure conversion modules follow the existing hit-position pattern and consume named defaults from `game-defaults.ts`. `EtternaToOsuConversion` owns the cross-game mapping, while `OsuSkinWriter` only serializes the already-converted playfield values through template wildcards.

**Tech Stack:** TypeScript, Node.js test runner, existing Lua profile reader, osu! template renderer, Biome, architecture boundary tests.

## Global Constraints

- Apply only to the Etterna-to-osu! conversion direction.
- Preserve the existing Lua reader and its case-insensitive `GameplayXYCoordinates["4K"]` lookup.
- Convert with `ComboPosition = round(230 + ComboY)`.
- Convert with `ScorePosition = round(240 + JudgmentY)`.
- Store `230`, `240`, and both Etterna neutral values `0` in `gameDefaults`; do not embed them in converters or writers.
- Keep the domain fields `comboPosition` and `judgementPosition`.
- Serialize target `judgementPosition` as osu! `ScorePosition`.
- Use separate `getComboPosition` and `getJudgementPosition` functions; do not introduce a generic coordinate converter.
- Preserve hit position, column width, receptor calibration `23`, image processing, LN publication, cleanup, assets, and diagnostics.
- Do not stage or commit; the user will review the working tree in the IDE.

---

## File Structure

- `src/config/game-defaults.ts`: owns source and target neutral positions.
- `src/conversions/etterna-to-osu/convert-combo-position.ts`: converts and rounds Etterna `ComboY`.
- `src/conversions/etterna-to-osu/convert-combo-position.test.ts`: verifies combo equivalence and rounding.
- `src/conversions/etterna-to-osu/convert-judgement-position.ts`: converts and rounds Etterna `JudgmentY`.
- `src/conversions/etterna-to-osu/convert-judgement-position.test.ts`: verifies score equivalence and rounding.
- `src/conversions/etterna-to-osu/etterna-to-osu-conversion.ts`: applies both pure converters to the target playfield.
- `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`: verifies conversion orchestration and preservation.
- `src/templates/skin.ini`: exposes combo and score wildcards.
- `src/adapters/osu/templates/render-osu-template.test.ts`: verifies exact production-template wildcard lines.
- `src/adapters/osu/writer/osu-skin-writer.ts`: supplies converted positions to the template renderer.
- `src/adapters/osu/writer/osu-skin-writer.test.ts`: verifies concrete writer output.
- `tests/integration/etterna-to-osu.test.ts`: verifies values from Lua through final `skin.ini`.
- `readme.md`: documents the equivalences.
- `docs/architecture.md`: documents conversion ownership and serialization.

### Task 1: Add Named Defaults and Pure Position Converters

**Files:**
- Modify: `src/config/game-defaults.ts`
- Create: `src/conversions/etterna-to-osu/convert-combo-position.test.ts`
- Create: `src/conversions/etterna-to-osu/convert-combo-position.ts`
- Create: `src/conversions/etterna-to-osu/convert-judgement-position.test.ts`
- Create: `src/conversions/etterna-to-osu/convert-judgement-position.ts`

**Interfaces:**
- Consumes: numeric Etterna `ComboY` and `JudgmentY` domain values.
- Produces: `getComboPosition(etternaComboPosition: number): number`.
- Produces: `getJudgementPosition(etternaJudgementPosition: number): number`.

- [ ] **Step 1: Write the failing pure-conversion tests**

Create `src/conversions/etterna-to-osu/convert-combo-position.test.ts`:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { getComboPosition } from "./convert-combo-position.ts"

test("converts Etterna combo position using game defaults", () => {
  assert.equal(getComboPosition(0), 230)
  assert.equal(getComboPosition(-20), 210)
})

test("rounds the converted combo position to the nearest integer", () => {
  assert.equal(getComboPosition(-20.4), 210)
  assert.equal(getComboPosition(-20.6), 209)
})
```

Create `src/conversions/etterna-to-osu/convert-judgement-position.test.ts`:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { getJudgementPosition } from "./convert-judgement-position.ts"

test("converts Etterna judgement position using game defaults", () => {
  assert.equal(getJudgementPosition(0), 240)
  assert.equal(getJudgementPosition(4), 244)
})

test("rounds the converted judgement position to the nearest integer", () => {
  assert.equal(getJudgementPosition(4.4), 244)
  assert.equal(getJudgementPosition(4.6), 245)
})
```

- [ ] **Step 2: Run both tests and verify RED**

Run:

```powershell
node --test src/conversions/etterna-to-osu/convert-combo-position.test.ts src/conversions/etterna-to-osu/convert-judgement-position.test.ts
```

Expected: FAIL because both conversion modules do not exist.

- [ ] **Step 3: Add the named game defaults**

Update `src/config/game-defaults.ts`:

```ts
export const gameDefaults = {
  etterna: {
    hitPosition: 0,
    judgementPosition: 0,
    comboPosition: 0,
    location: "C:/Games/Etterna",
  },
  osu: {
    hitPosition: 438,
    judgementPosition: 240,
    comboPosition: 230,
    location: "%LOCALAPPDATA%/osu",
  },
} as const
```

- [ ] **Step 4: Implement the two pure converters**

Create `src/conversions/etterna-to-osu/convert-combo-position.ts`:

```ts
import { gameDefaults } from "../../config/game-defaults.ts"

export function getComboPosition(etternaComboPosition: number): number {
  return Math.round(
    etternaComboPosition -
      gameDefaults.etterna.comboPosition +
      gameDefaults.osu.comboPosition,
  )
}
```

Create `src/conversions/etterna-to-osu/convert-judgement-position.ts`:

```ts
import { gameDefaults } from "../../config/game-defaults.ts"

export function getJudgementPosition(etternaJudgementPosition: number): number {
  return Math.round(
    etternaJudgementPosition -
      gameDefaults.etterna.judgementPosition +
      gameDefaults.osu.judgementPosition,
  )
}
```

- [ ] **Step 5: Run both tests and verify GREEN**

Run:

```powershell
node --test src/conversions/etterna-to-osu/convert-combo-position.test.ts src/conversions/etterna-to-osu/convert-judgement-position.test.ts
```

Expected: 4 tests pass.

### Task 2: Apply Both Converters to the Target Model

**Files:**
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.ts`

**Interfaces:**
- Consumes: `getComboPosition(number): number` and `getJudgementPosition(number): number`.
- Produces: an osu! `SkinModel` whose `comboPosition` and `judgementPosition` contain target values.

- [ ] **Step 1: Write failing orchestration assertions**

In `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`, extend the successful
conversion test:

```ts
assert.equal(result.playfield.hitPosition, 431)
assert.equal(result.playfield.judgementPosition, 244)
assert.equal(result.playfield.comboPosition, 210)
assert.equal(result.playfield.columnWidth, 62)
assert.equal(result.assets, etternaSkin.assets)
assert.equal(result.diagnostics, etternaSkin.diagnostics)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts
```

Expected: FAIL because the result still contains source values `4` and `-20`.

- [ ] **Step 3: Apply both converters**

Update imports in `src/conversions/etterna-to-osu/etterna-to-osu-conversion.ts`:

```ts
import { getColumnWidth } from "./convert-column-width.ts"
import { getComboPosition } from "./convert-combo-position.ts"
import { getHitPosition } from "./convert-hit-position.ts"
import { getJudgementPosition } from "./convert-judgement-position.ts"
```

Extend the target playfield:

```ts
playfield: {
  ...source.playfield,
  hitPosition: getHitPosition(source.playfield.hitPosition),
  judgementPosition: getJudgementPosition(source.playfield.judgementPosition),
  comboPosition: getComboPosition(source.playfield.comboPosition),
  columnWidth: getColumnWidth(source.playfield.columnWidth),
},
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts
```

Expected: 2 tests pass.

### Task 3: Render Converted Positions into `skin.ini`

**Files:**
- Modify: `src/templates/skin.ini`
- Modify: `src/adapters/osu/templates/render-osu-template.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.ts`

**Interfaces:**
- Consumes: target `playfield.comboPosition` and `playfield.judgementPosition`.
- Produces: `${combo_position}` and `${score_position}` replacements in the copied output template.

- [ ] **Step 1: Add the failing production-template assertion**

Add to `src/adapters/osu/templates/render-osu-template.test.ts`:

```ts
test("uses combo and score position wildcards", async () => {
  const template = await readFile(path.resolve("src", "templates", "skin.ini"), "utf8")
  const positionLines = template
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(ComboPosition|ScorePosition):/.test(line))

  assert.deepEqual(positionLines, [
    `ComboPosition: \${combo_position}`,
    `ScorePosition: \${score_position}`,
  ])
})
```

- [ ] **Step 2: Extend the writer test with position wildcards**

In the successful fixture template in
`src/adapters/osu/writer/osu-skin-writer.test.ts`, use:

```ts
`Name: \${skin_name}\nHitPosition: \${hit_position}\nComboPosition: \${combo_position}\nScorePosition: \${score_position}\nColumnWidth: \${column_width},\${column_width},\${column_width},\${column_width}\n`
```

Change `completeOsuSkin` to carry:

```ts
judgementPosition: 244,
comboPosition: 210,
```

Expect:

```ts
"Name: Fixture\nHitPosition: 432\nComboPosition: 210\nScorePosition: 244\nColumnWidth: 62,62,62,62\n"
```

Use the same fixture template in the failed-LN writer and transactional publisher tests so
all writer fixtures match the required replacement contract.

- [ ] **Step 3: Run the template and writer tests and verify RED**

Run:

```powershell
node --test src/adapters/osu/templates/render-osu-template.test.ts src/adapters/osu/writer/osu-skin-writer.test.ts
```

Expected:

- The production-template test fails because it still contains fixed `250` and `280`.
- The writer test fails because the writer preserves the two unknown wildcards.

- [ ] **Step 4: Replace fixed template values with wildcards**

Update `src/templates/skin.ini`:

```ini
    ComboPosition: ${combo_position}
    HitPosition: ${hit_position}
    ScorePosition: ${score_position}
```

- [ ] **Step 5: Supply the target values from the writer**

Extend replacements in `src/adapters/osu/writer/osu-skin-writer.ts`:

```ts
await renderTemplateFile(skinIniPath, {
  skin_name: skin.metadata.name,
  hit_position: skin.playfield.hitPosition,
  combo_position: skin.playfield.comboPosition,
  score_position: skin.playfield.judgementPosition,
  column_width: skin.playfield.columnWidth,
})
```

- [ ] **Step 6: Run the template and writer tests and verify GREEN**

Run:

```powershell
node --test src/adapters/osu/templates/render-osu-template.test.ts src/adapters/osu/writer/osu-skin-writer.test.ts
```

Expected: all template and writer tests pass.

### Task 4: Verify End-to-End Conversion and Document It

**Files:**
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: the complete reader → conversion → writer → transactional publication flow.
- Produces: final `skin.ini` lines `ComboPosition: 210` and `ScorePosition: 244`.

- [ ] **Step 1: Change the integration source coordinates**

In `tests/integration/etterna-to-osu.test.ts`, use:

```lua
["4k"] = {
  NoteFieldY = -6,
  JudgmentY = 4,
  ComboY = -20,
},
```

Extend its template fixture:

```ts
`Name: \${skin_name}\nHitPosition: \${hit_position}\nComboPosition: \${combo_position}\nScorePosition: \${score_position}\nColumnWidth: \${column_width},\${column_width},\${column_width},\${column_width}\n`
```

Expect:

```ts
"Name: Fixture Skin\nHitPosition: 432\nComboPosition: 210\nScorePosition: 244\nColumnWidth: 62,62,62,62\n"
```

- [ ] **Step 2: Run the integration test and verify GREEN**

Run:

```powershell
node --test tests/integration/etterna-to-osu.test.ts
```

Expected: 1 test passes while all existing receptor, note, LN, cleanup, and diagnostic
assertions remain unchanged.

- [ ] **Step 3: Document the mappings**

Add to `readme.md`:

```markdown
Etterna `ComboY` and `JudgmentY` are read from
`GameplayXYCoordinates["4K"]`. The Etterna neutral value `0` maps to osu!
`ComboPosition 230` and `ScorePosition 240`, with one-to-one offsets:
`ComboPosition = round(230 + ComboY)` and
`ScorePosition = round(240 + JudgmentY)`.
```

Update the `conversions` section of `docs/architecture.md`:

```markdown
The Etterna-to-osu! conversion maps hit position, combo position, judgement/score
position, and column width using named game defaults. The osu! writer only serializes
the converted target values.
```

- [ ] **Step 4: Format and run complete verification**

Run:

```powershell
npm run format
npm run lint
npm test
npm run typecheck
npm run test:architecture
git diff --check
git status --short
git diff --cached --name-only
```

Expected:

- Biome formatting and lint pass.
- All tests pass.
- TypeScript reports no errors.
- Architecture boundaries contain no violations or cycles.
- Git reports no whitespace errors.
- The cached path list is empty.
- All intended changes, including the existing LN work and this feature, remain unstaged
  and uncommitted for IDE review.
