# Game-Specific Template Directories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing osu! output template bundle to `src/templates/osu` and update every active production, test, and documentation reference.

**Architecture:** `src/templates` becomes the parent directory for output-game bundles, while `osuTemplatesPath` remains the single production source of the osu! bundle location. The writer API and relative layout inside the osu! bundle remain unchanged.

**Tech Stack:** TypeScript, Node.js test runner, Node.js filesystem/path APIs, Biome.

## Global Constraints

- Move every current `src/templates` asset without changing its contents.
- Do not create an Etterna template in this change.
- Do not change output paths inside `skin.ini` or writer contracts.
- Do not modify the user's parallel `.tmp`, `src/scripts`, or `package.json` work.
- Do not rewrite historical specifications or plans.
- Do not create a commit; leave the completed change available for IDE review.

---

### Task 1: Separate the osu! Template Bundle

**Files:**
- Modify: `src/config/paths.test.ts`
- Modify: `src/config/paths.ts`
- Modify: `src/adapters/osu/templates/render-osu-template.test.ts`
- Move: `src/templates/*` to `src/templates/osu/*`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: `osuTemplatesPath: string` as the CLI's configured source directory for `OsuSkinWriter`.
- Produces: the same `osuTemplatesPath: string`, now resolving to `src/templates/osu`, and an unchanged template bundle rooted at that directory.

- [ ] **Step 1: Write the failing path test**

Add the existing exported constant to the import and assert the game-specific path:

```ts
import { osuTemplatesPath, resolveOsuSkinOutputPath } from "./paths.ts"

test("resolves the osu template bundle from its game-specific directory", () => {
  assert.equal(osuTemplatesPath, path.resolve("src", "templates", "osu"))
})
```

Change each direct production-template read in
`src/adapters/osu/templates/render-osu-template.test.ts` from:

```ts
path.resolve("src", "templates", "skin.ini")
```

to:

```ts
path.resolve("src", "templates", "osu", "skin.ini")
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test src/config/paths.test.ts src/adapters/osu/templates/render-osu-template.test.ts
```

Expected: the path assertion fails because `osuTemplatesPath` still resolves to
`src/templates`, and production-template reads fail because `src/templates/osu/skin.ini`
does not exist.

- [ ] **Step 3: Move the bundle and update the production path**

Create `src/templates/osu`, move every existing file directly under `src/templates` into
it, and change `src/config/paths.ts` to:

```ts
export const osuTemplatesPath = path.resolve("src", "templates", "osu")
```

Do not move or modify anything outside `src/templates`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
node --test src/config/paths.test.ts src/adapters/osu/templates/render-osu-template.test.ts
```

Expected: every focused test passes.

- [ ] **Step 5: Update current documentation**

Change the README structure to show:

```text
templates/
  osu/
```

Update `docs/architecture.md` so `templates` is documented as the root of
game-specific output bundles and `templates/osu` is documented as the complete current
osu! output skeleton. Leave historical files under `docs/superpowers` unchanged except
for this specification and plan.

- [ ] **Step 6: Verify active references**

Run:

```powershell
rg -n 'path\.resolve\("src", "templates"\)|src/templates/(skin\.ini|receptor-base\.png|LNB\.png|LNT\.png)' src tests README.md docs/architecture.md
```

Expected: no active production, test, README, or architecture reference points to the
former flat template bundle.

- [ ] **Step 7: Run complete verification**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run test:architecture
git diff --check
```

Expected: every command exits with code `0`. Do not run
`npm run test:trim-osu-receptor`, because it writes to the user's parallel `.tmp` work.
