# Etterna Note Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve Etterna tap-note textures and generate the four static PNG files referenced by the osu!mania `skin.ini` template.

**Architecture:** Extract shared `NoteSkin.lua` facts into one Etterna context module used by receptors and notes. A note-specific analyzer resolves inline or external `Tap Note` loaders, assigns frames after comparing all four mapped assets, and sends format-neutral note definitions through a dimension-preserving Sharp transform and an osu-only writer.

**Tech Stack:** TypeScript, Node.js test runner, luaparse, Sharp.

## Global Constraints

- Only Etterna → osu conversion is implemented.
- Lua is parsed statically and never executed.
- Output names are `mania/notes/{left,down,up,right}.png`.
- Dedicated images and selected frames retain their original dimensions.
- A single shared `1xN` sheet uses frame `0` for left/right and frame `1` for down/up.
- Multiple `1xN` sheets and every `MxN` sheet where `M > 1` use frame `0` from the Lua-selected image.
- Rotation is applied only when `PartsToRotate["Tap Note"]` is explicitly `true`.
- All four note buffers must render before any note output is written.
- Tap notes only; long-note bodies and tails are outside this plan.
- Keep implementation changes uncommitted for user review.

---

### Task 1: Shared Etterna NoteSkin context

**Files:**
- Create: `src/engine/etterna/noteskin-context.ts`
- Create: `src/engine/etterna/noteskin-context.test.ts`
- Modify: `src/engine/etterna/receptors/analyze-noteskin.ts`

**Interfaces:**
- Produces `loadNoteSkinContext(skinDirectory): Promise<NoteSkinContext>`.
- `NoteSkinContext` exposes `filePath`, `source`, `resolver`, `buttonRedirections`, `rotations`, `partsToRotate`, and `getFunctionSource(name)`.

- [ ] Write a failing test with `ButtonRedir`, legacy `RedirTable`, signed rotations, `PartsToRotate["Tap Note"]`, and an inline `createNote` function.
- [ ] Run `node --test src/engine/etterna/noteskin-context.test.ts`; expect missing-module failure.
- [ ] Move the existing static table/function extraction into `noteskin-context.ts`, including `TableKey` string keys for `PartsToRotate`.
- [ ] Update the receptor analyzer to consume the new context without changing receptor behavior.
- [ ] Run the context and receptor tests plus `npm run typecheck`; expect all to pass.

### Task 2: Generic external element resolution

**Files:**
- Modify: `src/engine/etterna/receptors/resolve-files.ts`
- Modify: `src/engine/etterna/receptors/resolve-files.test.ts`

**Interfaces:**
- Produces `resolveElementLua(direction, element): Promise<string | undefined>`.
- Keeps `resolveReceptorLua(direction)` as a compatibility wrapper.

- [ ] Add failing tests for `Down Tap Note.lua`, `Up Tap Note.redir`, case-insensitive lookup, redirect cycles, and skin-boundary rejection.
- [ ] Run the resolver test and confirm failures because `resolveElementLua` is absent.
- [ ] Generalize the existing bounded `.lua`/`.redir` traversal to accept an element name.
- [ ] Re-run resolver tests and typecheck.

### Task 3: Tap-note texture analysis and four-direction mapping

**Files:**
- Create: `src/engine/note.ts`
- Create: `src/engine/etterna/notes/analyze-tap-note.ts`
- Create: `src/engine/etterna/notes/analyze-notes.ts`
- Create: `src/engine/etterna/notes/analyze-notes.test.ts`

**Interfaces:**
- Produces `NoteImage { filePath, frame?, rotation }` and `NoteSet = Record<Direction, NoteImage>`.
- Produces `analyzeEtternaNotes(skinDirectory): Promise<{ notes: NoteSet; warnings: string[] }>`.

- [ ] Write temporary-skin tests for four inline dedicated textures and external `Tap Note.lua` selected through redirects.
- [ ] Add tests proving one shared `1xN` maps frames `{left:0, down:1, up:1, right:0}`.
- [ ] Add tests proving two Lua-selected `1xN` files use frame `0`, and an `MxN` file with `M > 1` uses frame `0`.
- [ ] Add tests proving rotation is used only when `PartsToRotate["Tap Note"]` is true.
- [ ] Add a missing-direction diagnostic test and ambiguity-warning test.
- [ ] Run the focused test; expect missing-module failure.
- [ ] Implement sprite texture collection for direct strings and `NOTESKIN:GetPath(...)`, using the controlled evaluator and resolver.
- [ ] Resolve all four preliminary assets, then apply the shared-sheet frame rule by physical path and layout.
- [ ] Re-run focused tests and typecheck.

### Task 4: Dimension-preserving note rendering

**Files:**
- Modify: `src/transform/image.ts`
- Modify: `src/transform/image.test.ts`

**Interfaces:**
- Produces `renderNoteImage(note: NoteImage): Promise<Buffer>`.

- [ ] Add failing synthetic-PNG tests for `1xN` extraction, `MxN` frame zero, rotation after extraction, unchanged dimensions, and PNG output.
- [ ] Run the image test and verify `renderNoteImage` is missing.
- [ ] Extract the existing extract-before-rotate primitive and use it without resize or canvas composition for notes.
- [ ] Keep receptor resize/canvas behavior unchanged.
- [ ] Re-run image tests and typecheck.

### Task 5: Atomic osu note writer

**Files:**
- Create: `src/engine/osu/write-notes.ts`
- Create: `src/engine/osu/write-notes.test.ts`

**Interfaces:**
- Produces `writeOsuNotes({notes, outputDirectory, render?}): Promise<void>`.

- [ ] Write a failing test for the four exact filenames under `mania/notes`.
- [ ] Write a failing test asserting no directory or file is created if one renderer rejects.
- [ ] Run the focused test and confirm missing-module failure.
- [ ] Render all four buffers with `Promise.all`, then create the directory and write the prepared buffers.
- [ ] Re-run focused tests and typecheck.

### Task 6: Conversion integration

**Files:**
- Modify: `src/conversion/etterna-to-osu.ts`
- Modify: `src/conversion/etterna-to-osu.test.ts`

**Interfaces:**
- `convertEtternaToOsu` analyzes and writes receptors and notes and returns combined warnings.

- [ ] Extend the integration fixture with four note textures and assert the copied `skin.ini` references four generated PNGs.
- [ ] Run the integration test and verify it fails because `mania/notes` is absent.
- [ ] Analyze notes alongside receptors and call `writeOsuNotes` during conversion.
- [ ] Combine receptor and note warnings without changing the public result type.
- [ ] Re-run integration, full tests, typecheck, and lint.

### Task 7: Real-skin and final verification

**Files:**
- Verify only; do not modify `tmp` or create committed output.

- [ ] Analyze every NoteSkin under `tmp` and report resolved paths, frames, and rotations.
- [ ] Render all four notes for every resolvable sample into an OS temporary directory and delete it afterward.
- [ ] For a newly observed unsupported pattern, add a compact failing fixture before changing production code.
- [ ] Run `npm test`; expect zero failures.
- [ ] Run `npm run typecheck`; expect zero errors.
- [ ] Run `npm run lint`; expect no diagnostics.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Report the uncommitted implementation files for IDE review.
