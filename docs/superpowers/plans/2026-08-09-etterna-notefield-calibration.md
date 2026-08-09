# Etterna NoteField Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the receptor position in generated Etterna profiles by one unit for osu!mania-to-Etterna migrations.

**Architecture:** Apply the calibration only in `EtternaProfileWriter`, immediately before profile-template rendering. The conversion model remains the source of the uncalibrated semantic position, so unrelated routes and output fields are unaffected.

**Tech Stack:** TypeScript, Node.js built-in test runner.

## Global Constraints

- Apply `+1` only to the rendered `NoteFieldY` value.
- Preserve the rendered `ComboY` and `JudgmentY` values.
- Do not change Etterna-to-osu! behavior.

---

### Task 1: Calibrate the rendered Etterna NoteField position

**Files:**
- Modify: `src/adapters/etterna/writer/etterna-profile-writer.test.ts`
- Modify: `src/adapters/etterna/writer/etterna-profile-writer.ts`

**Interfaces:**
- Consumes: `SkinModel.playfield.hitPosition: number`.
- Produces: `NoteFieldY` rendered as `skin.playfield.hitPosition + 1`.

- [ ] **Step 1: Write the failing test**

Change the expected generated Lua in the first profile-writer test to:

```ts
"return { ReceptorSize= 107, NoteFieldY= -6, ComboY= -20, JudgmentY= 4, JudgmentZoom= 0.35, ComboZoom= 0.6 }\\n"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/adapters/etterna/writer/etterna-profile-writer.test.ts`

Expected: the profile-content assertion fails because the current output still contains `NoteFieldY= -7`.

- [ ] **Step 3: Write minimal implementation**

Add a named `noteFieldPositionCalibration = 1` constant to
`etterna-profile-writer.ts`, then pass this expression as `hitPosition`:

```ts
skin.playfield.hitPosition + noteFieldPositionCalibration
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/adapters/etterna/writer/etterna-profile-writer.test.ts`

Expected: both profile-writer tests pass.

- [ ] **Step 5: Run project verification**

Run: `npm test && npm run typecheck && npm run lint`

Expected: all checks exit successfully.
