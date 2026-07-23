# Etterna Receptor Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover normal and pressed Etterna receptor sprites statically, transform them into osu!mania receptor images, and integrate their generation into Etterna → osu conversion.

**Architecture:** A format-neutral receptor model carries resolved image/frame/rotation data. Etterna-only analyzers parse Lua without executing it and resolve assets with confidence-ranked candidates; generic Sharp transforms render PNG buffers; an osu-only writer publishes all eight receptor files atomically after every image has rendered.

**Tech Stack:** TypeScript, Node.js test runner, luaparse, Sharp.

## Global Constraints

- Only Etterna → osu conversion is implemented now; format-specific code remains isolated for a future reverse adapter.
- Pressed osu receptors contain only the pressed/overlay Etterna asset, never a composite with the normal receptor.
- Output names are `mania/receptors/{left,down,up,right}.png` and `{direction}_tap.png`.
- Source sprites are never enlarged; images larger than `150×150` are reduced proportionally.
- The receptor is horizontally centered and anchored to the top of a transparent canvas.
- Canvas height is `356 + (438 - hitPosition) * 3`, with a floor equal to the rendered receptor height.
- Lua is parsed statically and never executed.
- Missing normal or pressed states fail before any receptor output is written.
- Ambiguities choose the highest-confidence candidate and return warnings.
- Do not commit; the user will review the working tree in the IDE first.

---

## File Structure

- `src/engine/receptor.ts`: shared direction, state, frame, rotation, candidate, and resolved-receptor types.
- `src/engine/etterna/receptors/evaluate-expression.ts`: safe evaluation of the small Lua expression subset used by texture declarations.
- `src/engine/etterna/receptors/resolve-files.ts`: case-insensitive, extension-optional asset lookup and `.redir` resolution constrained to the skin directory.
- `src/engine/etterna/receptors/confidence.ts`: deterministic evidence scores, candidate selection, and ambiguity warnings.
- `src/engine/etterna/receptors/analyze-receptor.ts`: inspect one receptor Lua AST/source and collect normal/pressed candidates.
- `src/engine/etterna/receptors/analyze-noteskin.ts`: resolve directions, redirects, rotations, delegated receptor Lua files, and complete four-direction receptor definitions.
- `src/transform/image.ts`: Sharp frame extraction, rotation, proportional downscale, and top-aligned transparent canvas rendering.
- `src/engine/osu/write-receptors.ts`: render every output to memory, then create/write the osu receptor directory.
- `src/conversion/etterna-to-osu.ts`: orchestrate templates, hit position, static analysis, rendering, and warnings.
- `src/engine/etterna/etterna.ts`: retain Etterna discovery/profile responsibilities and delegate conversion.

### Task 1: Shared model and expression evaluator

**Files:**
- Create: `src/engine/receptor.ts`
- Create: `src/engine/etterna/receptors/evaluate-expression.ts`
- Create: `src/engine/etterna/receptors/evaluate-expression.test.ts`

**Interfaces:**
- Produces `Direction`, `ReceptorState`, `SpriteFrame`, `ReceptorCandidate`, `ResolvedReceptor`, and `ReceptorSet`.
- Produces `evaluateLuaString(expression, variables): string | undefined`.

- [ ] Write tests proving string literals, identifier lookup, `..` concatenation, and unsupported expressions returning `undefined`.
- [ ] Run `node --test src/engine/etterna/receptors/evaluate-expression.test.ts` and verify failure because the module does not exist.
- [ ] Add the shared types and recursive evaluator over luaparse expressions.
- [ ] Re-run the focused test and `npm run typecheck`; both must pass.

### Task 2: Etterna file resolution and redirects

**Files:**
- Create: `src/engine/etterna/receptors/resolve-files.ts`
- Create: `src/engine/etterna/receptors/resolve-files.test.ts`

**Interfaces:**
- Produces `createSkinFileResolver(skinDirectory)` with `resolveAsset(logicalPath)` and `resolveReceptorLua(direction)`.
- Resolves `.png`/`.jpg`/`.jpeg` and metadata-decorated names while preserving the physical absolute path.

- [ ] Write temp-directory tests for case-insensitive names, missing extensions, `2x1` metadata, `.redir`, traversal rejection, and redirect cycles.
- [ ] Run the focused test and verify the missing-module failure.
- [ ] Implement a normalized in-root file index and bounded redirect traversal.
- [ ] Re-run focused tests and typecheck.

### Task 3: Confidence ranking and receptor Lua analysis

**Files:**
- Create: `src/engine/etterna/receptors/confidence.ts`
- Create: `src/engine/etterna/receptors/analyze-receptor.ts`
- Create: `src/engine/etterna/receptors/analyze-receptor.test.ts`

**Interfaces:**
- Produces `selectCandidate(state, candidates)` returning the winner plus zero or one ambiguity warning.
- Produces `analyzeReceptorLua({source, filePath, direction, variables, resolver})`.

- [ ] Write fixtures for explicit visibility (`release`/`pressed` and Go/Press), `ReceptorOverlay`, lone `2x1`, explicit `Frame0000`, concatenated texture expressions, ambiguity, and a missing state.
- [ ] Run the focused tests and verify failure because the analyzer is absent.
- [ ] Traverse luaparse table constructors, collect `Def.Sprite` fields and command source, resolve `NOTESKIN:GetPath` arguments, infer frames from fields/filename metadata, and attach evidence scores.
- [ ] Implement deterministic selection in evidence order: visibility, overlay, semantic names, frame metadata, filename.
- [ ] Re-run focused tests and typecheck.

### Task 4: NoteSkin direction orchestration

**Files:**
- Create: `src/engine/etterna/receptors/analyze-noteskin.ts`
- Create: `src/engine/etterna/receptors/analyze-noteskin.test.ts`

**Interfaces:**
- Produces `analyzeEtternaReceptors(skinDirectory): Promise<{ receptors: ReceptorSet; warnings: string[] }>`.

- [ ] Write compact temp-skin tests for inline `createReceptor`, delegated `LoadActor(NOTESKIN:GetPath(Button, Element))`, `ButtonRedir`, `Rotate`, external `Down Receptor.lua`, and failure when either state is absent.
- [ ] Run the focused tests and verify failure because the module is absent.
- [ ] Parse `NoteSkin.lua`, read constant tables, resolve the effective source direction and rotation, then invoke the receptor analyzer once per direction.
- [ ] Ensure redirected directions reuse the resolved source asset and add their own rotation.
- [ ] Re-run focused tests and typecheck.

### Task 5: Sharp receptor rendering

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/transform/image.ts`
- Create: `src/transform/image.test.ts`

**Interfaces:**
- Produces `getReceptorCanvasHeight(hitPosition, baseHeight, receptorHeight): number`.
- Produces `renderReceptorImage(definition, {hitPosition, baseImagePath}): Promise<Buffer>`.

- [ ] Add Sharp as a runtime dependency.
- [ ] Write synthetic PNG tests for frame extraction, 90/180/270-degree rotation, proportional downscale, no enlargement, horizontal centering, top anchoring, transparent padding, growth, shrink, and receptor-height floor.
- [ ] Run the focused test and verify failure because the image module is absent.
- [ ] Implement extract-before-rotate, `fit: "inside"` with `withoutEnlargement`, transparent raw canvas composition, and PNG output.
- [ ] Re-run focused tests and typecheck.

### Task 6: osu writer with prepare-before-write behavior

**Files:**
- Create: `src/engine/osu/write-receptors.ts`
- Create: `src/engine/osu/write-receptors.test.ts`

**Interfaces:**
- Produces `writeOsuReceptors({receptors, outputDirectory, hitPosition, baseImagePath, render?}): Promise<void>`.

- [ ] Write tests for all eight exact filenames and for zero filesystem writes when any render rejects.
- [ ] Run the focused test and verify failure because the writer module is absent.
- [ ] Render all direction/state buffers first, then create `mania/receptors` and write them.
- [ ] Re-run focused tests and typecheck.

### Task 7: Etterna → osu integration

**Files:**
- Create: `src/conversion/etterna-to-osu.ts`
- Create: `src/conversion/etterna-to-osu.test.ts`
- Modify: `src/engine/engine.ts`
- Modify: `src/engine/etterna/etterna.ts`

**Interfaces:**
- Produces `convertEtternaToOsu(options): Promise<{ warnings: string[] }>`.
- Changes `Engine.convertSkin` to return `Promise<void>` so the CLI naturally waits for image generation.

- [ ] Write an integration test with a temporary Etterna skin/profile-output setup and assert rendered `skin.ini` plus eight receptor PNGs.
- [ ] Run the focused test and verify failure because the orchestrator is absent.
- [ ] Move conversion-only behavior from `EtternaEngine` into the orchestrator, retaining profile lookup and skin listing in the engine adapter.
- [ ] Await `engine.convertSkin(skin)` in the CLI and surface analyzer warnings without terminating successful conversion.
- [ ] Re-run integration, full tests, typecheck, and lint.

### Task 8: Final verification

**Files:**
- Verify all changed files; do not commit or stage.

- [ ] Run `npm test` and confirm the entire suite passes.
- [ ] Run `npm run typecheck` and confirm zero TypeScript errors.
- [ ] Run `npm run lint` and confirm no diagnostics.
- [ ] Run `git diff --check` and confirm no whitespace errors.
- [ ] Inspect `git status --short` and report every modified/untracked file for IDE review.
