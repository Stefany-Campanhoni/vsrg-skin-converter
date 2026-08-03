# Judgement Zoom Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Etterna judgement scaling to use a 0.75 multiplier while leaving combo scaling unchanged.

**Architecture:** The Etterna profile adapter remains the owner of the source formula. It normalizes `JudgmentZoom` with `1 + (zoom - 1) * 0.75`; downstream code keeps consuming `judgementScale` unchanged.

**Tech Stack:** TypeScript, Node.js test runner, Sharp, Biome.

## Global Constraints

- `ComboZoom` remains a direct scale and is not modified.
- `JudgmentZoom` maps to `1 + (zoom - 1) * 0.75`.
- `JudgmentZoom = 0.35` produces `judgementScale = 0.5125` (51.25%).
- Preserve 1-scale behavior and all existing image rounding rules.
- Do not modify `skin.ini`.
- Preserve existing local changes and do not create a commit.

---

### Task 1: Calibrate the source formula and expectations

**Files:**

- Modify: `src/adapters/etterna/profile/read-etterna-profile.ts`
- Modify: `src/adapters/etterna/profile/read-etterna-profile.test.ts`
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`
- Modify: `src/infrastructure/image/sharp-judgement-processor.test.ts`
- Modify: `src/adapters/osu/writer/write-osu-judgements.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- `PlayfieldConfiguration.judgementScale` remains a `number`.
- `renderJudgementImageVariants(definition, sourceDensity, scale)` and `writeOsuJudgements({ scale, ... })` keep their current signatures.

- [ ] **Step 1: Change expected output values first**

Replace each `0.675` expectation driven by `JudgmentZoom = 0.35` with `0.5125`. Update image expectations using existing rounding rules:

```ts
assert.equal(result.playfield.judgementScale, 0.5125)
// 6 × 4, density 1: SD 3 × 2; HD 6 × 4
// 9 × 7, density 2: SD 2 × 2; HD 5 × 4
```

- [ ] **Step 2: Run the focused tests to confirm RED**

Run: `node --test src/adapters/etterna/profile/read-etterna-profile.test.ts src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts src/infrastructure/image/sharp-judgement-processor.test.ts src/adapters/osu/writer/write-osu-judgements.test.ts src/adapters/osu/writer/osu-skin-writer.test.ts tests/integration/etterna-to-osu.test.ts`

Expected: FAIL because the parser retains the prior 0.5 multiplier.

- [ ] **Step 3: Implement the 0.75 multiplier and update documentation**

Change only the source normalization expression:

```ts
judgementScale: 1 + (judgementZoom - 1) * 0.75,
```

Update README and architecture wording from `0.5`/67.5% to `0.75`/51.25%. Do not change combo behavior, writer APIs, or `skin.ini`.

- [ ] **Step 4: Verify GREEN and full project checks**

Run: `npm test; npm run typecheck; npm run lint; npm run test:architecture; git diff --check`

Expected: every command exits with status 0. Do not commit.
