# Codebase Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the project into a layered, enforced architecture while preserving the current Etterna-to-osu! CLI behavior and generated assets.

**Architecture:** A game-neutral domain feeds application ports and a source/target conversion registry. Etterna and osu! behavior lives in format adapters, technical code lives in infrastructure, and a transactional publisher replaces the complete output only after a successful staged build.

**Tech Stack:** TypeScript with NodeNext modules, Node.js test runner, TypeScript compiler AST, luaparse, Sharp, Biome.

## Global Constraints

- Preserve the current Etterna-to-osu! CLI flow and generated paths.
- Keep Etterna Lua analysis static; never execute skin Lua.
- Internal imports and APIs may change freely.
- All technical names, comments, messages, and documentation are English.
- Comments exist only for non-obvious reasons, invariants, external constraints, or safety rules.
- Use named exports and `import type`; do not add default exports.
- Use `kebab-case` files and directories.
- Do not create generic `utils`, `helpers`, `common`, `objects`, or `constants` modules.
- A successful conversion fully replaces `output_folder`; a failure preserves the prior output.
- Keep implementation changes uncommitted for user IDE review.

---

### Task 1: Establish neutral domain models and application ports

**Files:**
- Create: `src/domain/game.ts`
- Create: `src/domain/image.ts`
- Create: `src/domain/diagnostics.ts`
- Create: `src/domain/skin.ts`
- Create: `src/application/ports/skin-catalog.ts`
- Create: `src/application/ports/skin-reader.ts`
- Create: `src/application/ports/skin-writer.ts`
- Create: `src/application/ports/output-publisher.ts`
- Create: `src/application/conversion/conversion-registry.test.ts`
- Create: `src/application/conversion/conversion-registry.ts`

**Interfaces:**
- Produces `GameId`, `ColumnDirection`, `SpriteFrame`, `ImageAsset`, `SkinReference`,
  `SkinModel`, `Diagnostic`, `SkinCatalog`, `SkinReader`, `SkinWriter`,
  `OutputPublisher`, `SkinConversion`, and `ConversionRegistry`.
- `ConversionRegistry.resolve(source, target)` returns the exact registered conversion or
  throws a contextual unsupported-pair error.

- [ ] **Step 1: Write the registry test**

```ts
test("resolves conversions by source and target", () => {
  const conversion: SkinConversion = {
    source: "etterna",
    target: "osu",
    convert: async (skin) => ({ ...skin, game: "osu" }),
  }
  const registry = new ConversionRegistry([conversion])
  assert.equal(registry.resolve("etterna", "osu"), conversion)
  assert.throws(() => registry.resolve("osu", "etterna"), /osu.*etterna/i)
})
```

- [ ] **Step 2: Run the test and confirm the modules are absent**

Run: `node --test src/application/conversion/conversion-registry.test.ts`

Expected: FAIL because the domain and registry modules do not exist.

- [ ] **Step 3: Implement the neutral models and small ports**

```ts
export const gameIds = ["etterna", "osu"] as const
export type GameId = (typeof gameIds)[number]

export const columnDirections = ["left", "down", "up", "right"] as const
export type ColumnDirection = (typeof columnDirections)[number]

export interface SpriteFrame {
  index: number
  columns: number
  rows: number
}

export interface ImageAsset {
  sourcePath: string
  frame?: SpriteFrame
  rotation: number
}
```

Define `SkinModel` with `game`, metadata, playfield configuration, receptors, tap notes,
and diagnostics. Define each port in its named file with no concrete imports.

- [ ] **Step 4: Implement and verify the registry**

Store conversions by `${source}:${target}`, reject duplicate registrations, and throw when
the requested pair is absent.

Run: `node --test src/application/conversion/conversion-registry.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 2: Extract shared Lua and image infrastructure

**Files:**
- Create: `src/infrastructure/lua/ast.ts`
- Move: `src/utils/lua.ts` to `src/infrastructure/lua/parse-lua-file.ts`
- Move: `src/utils/lua.test.ts` to `src/infrastructure/lua/parse-lua-file.test.ts`
- Move: `src/engine/etterna/receptors/evaluate-expression.ts` to `src/infrastructure/lua/evaluate-expression.ts`
- Move: `src/engine/etterna/receptors/evaluate-expression.test.ts` to `src/infrastructure/lua/evaluate-expression.test.ts`
- Move: `src/transform/image.ts` to `src/infrastructure/image/sharp-image-processor.ts`
- Move: `src/transform/image.test.ts` to `src/infrastructure/image/sharp-image-processor.test.ts`

**Interfaces:**
- Produces shared `AstObject`, `asAstObject`, `walkAst`, `getMemberName`,
  `getCallableName`, `getTableField`, `parseLuaFile`, `evaluateLuaString`,
  `renderReceptorImage`, `renderNoteImage`, and `getReceptorCanvasHeight`.
- Image functions consume the neutral `ImageAsset`.

- [ ] **Step 1: Add focused AST tests**

Create `src/infrastructure/lua/ast.test.ts` proving member names, callable identifiers,
table-field lookup, and traversal work for a compact luaparse AST.

- [ ] **Step 2: Run the AST test and confirm it fails because the module is absent**

Run: `node --test src/infrastructure/lua/ast.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement shared AST primitives**

```ts
export type AstObject = Record<string, unknown> & {
  type?: string
  range?: [number, number]
}

export function asAstObject(value: unknown): AstObject | undefined {
  return typeof value === "object" && value !== null ? (value as AstObject) : undefined
}
```

Move traversal and member/table helpers out of Etterna analyzers and add traversal guards
for `loc` and `range`.

- [ ] **Step 4: Move Lua parsing, expression evaluation, and Sharp processing**

Update imports, replace receptor/note-specific image types with `ImageAsset`, and preserve
all existing rendering behavior.

- [ ] **Step 5: Run infrastructure tests**

Run:
`node --test src/infrastructure/lua/*.test.ts src/infrastructure/image/*.test.ts`

Expected: all moved and new tests PASS.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 3: Reorganize the Etterna adapter around one shared context

**Files:**
- Create: `src/adapters/etterna/etterna-defaults.ts`
- Create: `src/adapters/etterna/catalog/etterna-skin-catalog.ts`
- Move: `src/engine/etterna/etterna-profile.ts` to `src/adapters/etterna/profile/read-etterna-profile.ts`
- Move: `src/engine/etterna/etterna-profile.test.ts` to `src/adapters/etterna/profile/read-etterna-profile.test.ts`
- Move: `src/engine/etterna/noteskin-context.ts` to `src/adapters/etterna/noteskin/note-skin-context.ts`
- Move: `src/engine/etterna/noteskin-context.test.ts` to `src/adapters/etterna/noteskin/note-skin-context.test.ts`
- Move: `src/engine/etterna/receptors/resolve-files.ts` to `src/adapters/etterna/noteskin/resolve-skin-files.ts`
- Move associated analyzer and test files into:
  - `src/adapters/etterna/noteskin/receptors/`
  - `src/adapters/etterna/noteskin/notes/`
- Create: `src/adapters/etterna/reader/etterna-skin-reader.test.ts`
- Create: `src/adapters/etterna/reader/etterna-skin-reader.ts`

**Interfaces:**
- `EtternaSkinCatalog.listSkins(location)` returns Etterna `SkinReference` objects.
- `loadNoteSkinContext(skinDirectory)` creates one parsed/indexed context.
- Receptor and note analyzers consume a supplied `NoteSkinContext`; they do not reload it.
- `EtternaSkinReader.readSkin(reference)` combines profile positions, receptors, tap notes,
  and diagnostics into one `SkinModel`.

- [ ] **Step 1: Write a reader integration test**

Use a temporary Etterna root containing one profile, one compact NoteSkin, receptor assets,
and note assets. Inject a context-loader spy and assert it is called exactly once.

- [ ] **Step 2: Run the reader test and confirm the reader is absent**

Run: `node --test src/adapters/etterna/reader/etterna-skin-reader.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Move the Etterna files and replace local AST helpers**

Update every moved test import. Use `ColumnDirection`, `ImageAsset`, `columnDirections`, and
the Lua infrastructure primitives.

- [ ] **Step 4: Change analyzers to context-consuming APIs**

```ts
export function analyzeEtternaReceptors(
  context: NoteSkinContext,
): Promise<EtternaReceptorAnalysis>

export function analyzeEtternaNotes(
  context: NoteSkinContext,
): Promise<EtternaNoteAnalysis>
```

Keep thin test helpers only where a test explicitly needs to load a context.

- [ ] **Step 5: Implement catalog and reader**

The reader loads the profile and NoteSkin context concurrently, passes the same context to
both asset analyzers, and returns typed diagnostics.

- [ ] **Step 6: Run all Etterna tests and typecheck**

Run: `node --test src/adapters/etterna/**/*.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 4: Reorganize osu! writing and cross-game conversion

**Files:**
- Move: `src/transform/hitposition.ts` to `src/conversions/etterna-to-osu/convert-hit-position.ts`
- Move its test beside it.
- Create: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`
- Create: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.ts`
- Move: `src/engine/osu/write-receptors.ts` to `src/adapters/osu/writer/write-osu-receptors.ts`
- Move: `src/engine/osu/write-notes.ts` to `src/adapters/osu/writer/write-osu-notes.ts`
- Move associated tests beside the writers.
- Move: `src/utils/template.ts` to `src/adapters/osu/templates/render-osu-template.ts`
- Move its test beside it.
- Move: `src/templates/skin.ini` to `src/adapters/osu/templates/files/skin.ini`
- Move: `src/templates/receptor-base.png` to `src/adapters/osu/templates/files/receptor-base.png`
- Create: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Create: `src/adapters/osu/writer/osu-skin-writer.ts`

**Interfaces:**
- `EtternaToOsuConversion implements SkinConversion`.
- `OsuSkinWriter implements SkinWriter`.
- Writer creates a complete osu! workspace but never publishes or mutates the final output.

- [ ] **Step 1: Write conversion tests**

Assert the conversion changes `game` to `osu`, converts and rounds hit position, preserves
assets and diagnostics, and rejects a non-Etterna source model.

- [ ] **Step 2: Run the test and confirm the conversion is absent**

Run: `node --test src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the cross-game conversion**

Move only the hit-position equivalence into this layer. Do not import filesystem, Sharp,
templates, or Etterna parsers.

- [ ] **Step 4: Move osu! writers and templates**

Update the writers to consume neutral image types and keep prepare-before-write behavior.

- [ ] **Step 5: Write and implement the complete osu! writer test**

Build a target model in a temporary workspace and assert `skin.ini`, four receptor pairs,
and four tap notes exist at the existing template paths.

- [ ] **Step 6: Run conversion, writer, and type tests**

Run:
`node --test src/conversions/**/*.test.ts src/adapters/osu/**/*.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 5: Implement transactional output publication

**Files:**
- Create: `src/infrastructure/filesystem/node-file-store.ts`
- Create: `src/infrastructure/filesystem/transactional-output-publisher.test.ts`
- Create: `src/infrastructure/filesystem/transactional-output-publisher.ts`

**Interfaces:**
- `TransactionalOutputPublisher implements OutputPublisher`.
- `publish(targetDirectory, build)` builds in a sibling staging directory and replaces the
  target only after `build` resolves.

- [ ] **Step 1: Write real-filesystem transaction tests**

Cover successful full replacement, build failure preserving the old target, removal of
staging directories, and rejection of unsafe root targets.

- [ ] **Step 2: Run the test and confirm the publisher is absent**

Run:
`node --test src/infrastructure/filesystem/transactional-output-publisher.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement safe staged publication**

Resolve the target, reject filesystem roots, use `mkdtemp` in the target parent, rename the
old output to a unique backup, promote staging, restore backup on promotion failure, and
clean temporary paths with explicit validated absolute paths.

- [ ] **Step 4: Run transaction tests and typecheck**

Run:
`node --test src/infrastructure/filesystem/transactional-output-publisher.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 6: Implement the application use case and migrate the CLI

**Files:**
- Create: `src/application/conversion/convert-skin.test.ts`
- Create: `src/application/conversion/convert-skin.ts`
- Create: `src/config/paths.ts`
- Create: `src/cli/prompts.ts`
- Create: `src/cli/main.ts`
- Modify: `src/cli.ts`
- Delete:
  - `src/engine/engine.ts`
  - `src/engine/etterna/etterna.ts`
  - `src/engine/osu.ts`
  - `src/constants/convertion.ts`
  - `src/constants/game.ts`
  - `src/templates/basis.ts`
  - superseded conversion and generic I/O modules

**Interfaces:**
- `convertSkin(request, dependencies)` reads, converts, stages/writes, publishes, and returns
  typed diagnostics.
- `src/cli.ts` is a minimal entry point importing `runCli`.

- [ ] **Step 1: Write the application use-case test with fakes**

Assert call order `read -> convert -> publish/write`, registry pair resolution, diagnostics,
and no writer call when reading fails.

- [ ] **Step 2: Run the test and confirm the use case is absent**

Run: `node --test src/application/conversion/convert-skin.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the use case**

```ts
export async function convertSkin(
  request: ConvertSkinRequest,
  dependencies: ConvertSkinDependencies,
): Promise<ConversionResult>
```

Resolve conversion and writer, read the source model, convert it, and invoke the output
publisher with a build callback.

- [ ] **Step 4: Migrate CLI composition**

Wire `EtternaSkinCatalog`, `EtternaSkinReader`, `EtternaToOsuConversion`,
`OsuSkinWriter`, and `TransactionalOutputPublisher`. Preserve the source-skin selection
interaction and fixed output location.

- [ ] **Step 5: Remove superseded modules and update package entry points**

Ensure no production import references `engine`, generic `utils`, generic `constants`, or
the old conversion orchestrator.

- [ ] **Step 6: Run application, integration, and CLI type verification**

Run:
`node --test src/application/**/*.test.ts tests/integration/**/*.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 7: Enforce architecture and finalize documentation

**Files:**
- Create: `tests/architecture/dependency-rules.test.ts`
- Move end-to-end conversion test to:
  `tests/integration/etterna-to-osu.test.ts`
- Create: `docs/architecture.md`
- Create: `docs/development-standards.md`
- Modify: `README.md`
- Modify: `package.json`
- Create after explicit user approval: `AGENTS.md`

**Interfaces:**
- Architecture test reports forbidden layer imports and production dependency cycles.
- `npm test` includes colocated, integration, and architecture tests.

- [ ] **Step 1: Write the architecture test**

Use the TypeScript compiler API to parse relative imports under `src`, resolve `.ts` targets,
classify files by top-level directory, validate the allowed dependency matrix, and run DFS
cycle detection over production modules.

- [ ] **Step 2: Run it against the migrated tree**

Run: `node --test tests/architecture/dependency-rules.test.ts`

Expected: PASS only when no forbidden imports or cycles remain.

- [ ] **Step 3: Update test scripts**

Set `test` to run both `src/**/*.test.ts` and `tests/**/*.test.ts`. Add an explicit
`test:architecture` script.

- [ ] **Step 4: Write authoritative documentation**

Document actual modules, data flow, placement rules, naming, imports, error propagation,
comment policy, testing, output transactions, and verification commands in English.

- [ ] **Step 5: Propose the concise AGENTS.md contents**

Follow the project-memory approval workflow. Do not create `AGENTS.md` until the user
approves the proposed permanent instructions.

- [ ] **Step 6: Run the full automated verification**

Run:

```text
npm test
npm run typecheck
npm run lint
npm run test:architecture
git diff --check
```

Expected: zero failures or diagnostics.

- [ ] **Step 7: Run the real-skin audit**

Analyze receptors and tap notes for every `tmp` directory containing `NoteSkin.lua`, render
all selected images into an OS temporary directory, report the count, and remove the
temporary directory.

Expected: every NoteSkin corpus entry analyzes and renders successfully.

- [ ] **Step 8: Report the uncommitted implementation**

List the architectural boundaries, compatibility evidence, documentation files, and current
`git status` for IDE review. Do not stage or commit implementation changes.
