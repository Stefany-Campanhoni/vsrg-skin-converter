# Empty Pressed Receptor Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve empty receptor images and use the normal receptor output when a pressed receptor is transparent.

**Architecture:** `renderReceptorImage` returns a transparent rendered canvas instead of rejecting an empty source. `writeOsuReceptors` renders normal and pressed receptors by direction, detects a transparent pressed buffer, and substitutes the normal buffer before writing the existing osu! filenames.

**Tech Stack:** TypeScript, Node.js test runner, Sharp.

## Global Constraints

- Visible receptors retain their current trimming and geometry behavior.
- Empty normal receptors remain transparent.
- Only empty pressed receptors use the normal receptor buffer for the same direction.

---

### Task 1: Preserve empty receptor renderings

**Files:**
- Modify: `src/infrastructure/image/sharp-image-processor.ts:99-135`
- Test: `src/infrastructure/image/sharp-image-processor.test.ts:341-370`

**Interfaces:**
- Consumes: `renderReceptorImage(definition, options): Promise<Buffer>`.
- Produces: a PNG canvas even when `definition` has no visible pixels.

- [ ] **Step 1: Write the failing test**

Replace the rejection assertion for a transparent `20 x 10` source with an assertion that `renderReceptorImage` resolves and its raw pixels have alpha bounds `{ left: 150, top: height, right: -1, bottom: -1 }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/infrastructure/image/sharp-image-processor.test.ts`

Expected: FAIL because `removeTrailingTransparentRows` throws `contains no visible pixels`.

- [ ] **Step 3: Write minimal implementation**

Change `removeTrailingTransparentRows` so `lastVisibleRow < 0` returns `image`. In `renderReceptorImage`, preserve the original stretched dimensions for transparent input so canvas construction can proceed without throwing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/infrastructure/image/sharp-image-processor.test.ts`

Expected: PASS.

### Task 2: Substitute the normal buffer for an empty pressed receptor

**Files:**
- Modify: `src/adapters/osu/writer/write-osu-receptors.ts:49-56`
- Test: `src/adapters/osu/writer/write-osu-receptors.test.ts`

**Interfaces:**
- Consumes: `render(definition, renderOptions): Promise<Buffer>` for normal and pressed definitions.
- Produces: `<direction>_tap@2x.png` equal to the normal rendered PNG when the pressed rendered PNG is fully transparent.

- [ ] **Step 1: Write the failing test**

Create normal and transparent pressed PNG fixtures for one direction, invoke `writeOsuReceptors`, and assert that `left_tap@2x.png` has the same bytes as `left@2x.png`. Assert a transparent normal image is still written successfully.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/adapters/osu/writer/write-osu-receptors.test.ts`

Expected: FAIL because the pressed buffer is written unchanged.

- [ ] **Step 3: Write minimal implementation**

Render both state buffers per direction, inspect the pressed buffer alpha channel with Sharp, and select the normal buffer only when every pressed alpha value is zero. Keep concurrent processing across directions and existing filenames.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/adapters/osu/writer/write-osu-receptors.test.ts`

Expected: PASS.

- [ ] **Step 5: Run complete verification**

Run: `npm test`

Expected: PASS with no failures.
