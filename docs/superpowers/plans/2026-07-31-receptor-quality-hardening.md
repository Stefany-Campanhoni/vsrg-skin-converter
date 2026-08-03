# Receptor Quality Hardening Implementation Plan

**Goal:** Preserve the approved receptor resize and empty-pressed fallback behavior while making the implementation modular, quiescent, explicit about failures, and safe for future maintenance.

**Architecture:** Sharp-specific alpha inspection belongs to image infrastructure. The osu! writer owns the target-specific rule that a transparent pressed receptor uses its normal counterpart. Every render and write batch must wait for all started siblings before reporting the first failure in input order.

**Tech Stack:** TypeScript, Node.js test runner, Sharp, Biome.

## Constraints

- Preserve all existing uncommitted user changes.
- Do not stage or commit files.
- Receptors narrower than 150 pixels are enlarged proportionally to 150 pixels after frame extraction and rotation, before vertical stretching and canvas composition.
- Receptors at least 150 pixels wide retain the existing fit-inside 150-by-150 behavior.
- Empty normal receptors remain transparent; only an empty pressed receptor falls back to the rendered normal receptor for the same direction.
- Image decoding failures are fatal and retain their original cause.

### Task 1: Extract image transparency inspection

**Files:**
- Create: `src/infrastructure/image/is-image-fully-transparent.ts`
- Create: `src/infrastructure/image/is-image-fully-transparent.test.ts`

- [ ] Add tests for visible, transparent, and invalid encoded images.
- [ ] Confirm the tests fail before the module exists.
- [ ] Implement a named Sharp-backed alpha inspection function without swallowing decoder errors.
- [ ] Run the focused test file.

### Task 2: Harden receptor preparation and publication

**Files:**
- Modify: `src/adapters/osu/writer/write-osu-receptors.ts`
- Modify: `src/adapters/osu/writer/write-osu-receptors.test.ts`

- [ ] Replace the nested fail-fast state batch with `settleAll`.
- [ ] Inject the transparency inspector for deterministic boundary tests.
- [ ] Wrap transparency failures with direction/state context and `cause`.
- [ ] Wrap each injected writer invocation in a promise boundary so synchronous throws become settled rejections.
- [ ] Use valid PNG buffers in tests except when invalid input is intentional.
- [ ] Cover transparent-normal preservation, state-level quiescence, contextual inspection failure, and synchronous-write quiescence.

### Task 3: Lock receptor geometry behavior

**Files:**
- Modify: `src/infrastructure/image/sharp-image-processor.test.ts`
- Verify: `src/infrastructure/image/sharp-image-processor.ts`
- Verify: `tests/integration/etterna-to-osu.test.ts`

- [ ] Preserve the approved below-150 proportional enlargement test.
- [ ] Add coverage for a tall receptor at or above 150 pixels wide to lock the existing fit-inside boundary.
- [ ] Keep the empty-normal rendered canvas behavior covered.
- [ ] Run focused image and integration tests.

### Task 4: Document the maintenance contract

**Files:**
- Modify: `docs/development-standards.md`
- Create: `docs/agent-prompt-guidelines.md`
- Modify: `readme.md`

- [ ] Document ownership of image mechanisms versus target policies.
- [ ] Document nested batch quiescence and synchronous callback protection.
- [ ] Document realistic encoded-image fixtures and the receptor processing order.
- [ ] Provide a reusable prompt checklist and prompt template for future iterations.
- [ ] Link the new guide from the project readme.

### Task 5: Compatibility and verification

- [ ] Audit representative real skins in `tmp` covering small receptors, sprite sheets, transparent pressed assets, and tall/asymmetric inputs where available.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test:architecture`.
- [ ] Run `git diff --check`.
- [ ] Review the final unstaged diff and confirm no unrelated changes were overwritten.

