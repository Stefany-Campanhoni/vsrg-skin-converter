# Hit Position and skin.ini Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert an Etterna hit position to an integer osu! hit position and render known values into the copied output `skin.ini`.

**Architecture:** Keep coordinate conversion and wildcard substitution as pure, independently tested functions. Add one filesystem wrapper that renders an existing file in place, then have `EtternaEngine` call it only after its existing template-copy step.

**Tech Stack:** TypeScript 7, Node.js 22+, Node test runner, Biome, luaparse

## Global Constraints

- Support only Etterna-to-osu! conversion.
- Derive the offset from `gamesDefault.etterna.hitposition` and `gamesDefault.osu.hitposition`.
- Round the converted hit position with `Math.round`.
- Use `skin.name` exactly, preserving spaces and special characters.
- Preserve wildcards whose keys have no supplied value.
- Modify only the copied `output_folder/skin.ini`; never write to `src/templates/skin.ini`.
- Do not create a commit until the user reviews and approves the implementation.

---

### Task 1: Etterna-to-osu! hit position conversion

**Files:**
- Create: `src/transform/hitposition.test.ts`
- Modify: `src/transform/hitposition.ts`

**Interfaces:**
- Consumes: `gamesDefault.etterna.hitposition` and `gamesDefault.osu.hitposition`
- Produces: `getHitPosition(etternaHitPosition: number): number`

- [ ] **Step 1: Write the failing conversion tests**

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import { getHitPosition } from "./hitposition.ts"

test("converts an Etterna hit position to osu using game defaults", () => {
  assert.equal(getHitPosition(-6), 432)
})

test("rounds the converted osu hit position to the nearest integer", () => {
  assert.equal(getHitPosition(-6.6), 431)
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test src/transform/hitposition.test.ts
```

Expected: FAIL because the current function requires three arguments.

- [ ] **Step 3: Implement the focused conversion**

Replace `src/transform/hitposition.ts` with:

```ts
import { gamesDefault } from "../templates/basis.ts"

export function getHitPosition(etternaHitPosition: number): number {
  return Math.round(
    etternaHitPosition -
      gamesDefault.etterna.hitposition +
      gamesDefault.osu.hitposition,
  )
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```powershell
node --test src/transform/hitposition.test.ts
```

Expected: 2 tests pass.

### Task 2: Generic wildcard renderer

**Files:**
- Create: `src/utils/template.ts`
- Create: `src/utils/template.test.ts`

**Interfaces:**
- Consumes: template content or an existing copied template file plus `TemplateReplacements`
- Produces:
  - `type TemplateReplacements = Readonly<Record<string, string | number>>`
  - `replaceWildcards(content: string, replacements: TemplateReplacements): string`
  - `renderTemplateFile(filePath: string, replacements: TemplateReplacements): void`

- [ ] **Step 1: Write failing pure-renderer tests**

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import { replaceWildcards } from "./template.ts"

test("replaces supplied string and numeric wildcards", () => {
  const template = "${skin_name}|${hit_position}|${zero}|${empty}"

  assert.equal(
    replaceWildcards(template, {
      skin_name: "My Etterna Skin",
      hit_position: 432,
      zero: 0,
      empty: "",
    }),
    "My Etterna Skin|432|0|",
  )
})

test("replaces every occurrence of a supplied wildcard", () => {
  assert.equal(replaceWildcards("${value}-${value}", { value: 12 }), "12-12")
})

test("preserves wildcards without a supplied value", () => {
  assert.equal(
    replaceWildcards("${skin_name}|${future_value}", { skin_name: "Skin" }),
    "Skin|${future_value}",
  )
})
```

- [ ] **Step 2: Run the pure-renderer tests and verify RED**

Run:

```powershell
node --test src/utils/template.test.ts
```

Expected: FAIL because `src/utils/template.ts` does not exist.

- [ ] **Step 3: Implement the pure renderer**

Create `src/utils/template.ts` with:

```ts
export type TemplateReplacements = Readonly<Record<string, string | number>>

const wildcardPattern = /\$\{([a-zA-Z0-9_]+)\}/g

export function replaceWildcards(
  content: string,
  replacements: TemplateReplacements,
): string {
  return content.replace(wildcardPattern, (wildcard, key: string) => {
    const value = replacements[key]

    return value === undefined ? wildcard : String(value)
  })
}
```

- [ ] **Step 4: Run the pure-renderer tests and verify GREEN**

Run:

```powershell
node --test src/utils/template.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Add a failing filesystem test**

Append to `src/utils/template.test.ts`:

```ts
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { renderTemplateFile } from "./template.ts"

test("renders only the copied output file", (context) => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "vsrg-template-"))
  const sourceFile = path.join(temporaryDirectory, "source-skin.ini")
  const outputFile = path.join(temporaryDirectory, "output-skin.ini")
  const template = "Name: ${skin_name}\nHitPosition: ${hit_position}\nFuture: ${future}"

  context.after(() => rmSync(temporaryDirectory, { recursive: true }))
  writeFileSync(sourceFile, template, "utf-8")
  copyFileSync(sourceFile, outputFile)

  renderTemplateFile(outputFile, {
    skin_name: "My Skin",
    hit_position: 432,
  })

  assert.equal(readFileSync(sourceFile, "utf-8"), template)
  assert.equal(
    readFileSync(outputFile, "utf-8"),
    "Name: My Skin\nHitPosition: 432\nFuture: ${future}",
  )
})
```

- [ ] **Step 6: Run the filesystem test and verify RED**

Run:

```powershell
node --test src/utils/template.test.ts
```

Expected: FAIL because `renderTemplateFile` is not exported.

- [ ] **Step 7: Implement in-place file rendering with contextual errors**

Add to `src/utils/template.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs"

export function renderTemplateFile(
  filePath: string,
  replacements: TemplateReplacements,
): void {
  try {
    const template = readFileSync(filePath, "utf-8")
    const renderedTemplate = replaceWildcards(template, replacements)

    writeFileSync(filePath, renderedTemplate, "utf-8")
  } catch (error) {
    throw new Error(`Failed to render template file "${filePath}".`, {
      cause: error,
    })
  }
}
```

- [ ] **Step 8: Run the renderer tests and verify GREEN**

Run:

```powershell
node --test src/utils/template.test.ts
```

Expected: 4 tests pass.

### Task 3: Wire rendering into Etterna conversion

**Files:**
- Modify: `src/engine/etterna/etterna.ts`

**Interfaces:**
- Consumes:
  - `getHitPosition(etternaHitPosition: number): number`
  - `renderTemplateFile(filePath: string, replacements: TemplateReplacements): void`
- Produces: a copied `output_folder/skin.ini` containing the selected skin name and converted hit position

- [ ] **Step 1: Add the conversion and renderer imports**

Add:

```ts
import { getHitPosition } from "../../transform/hitposition.ts"
import { renderTemplateFile } from "../../utils/template.ts"
```

- [ ] **Step 2: Render the copied skin.ini after profile extraction**

Immediately after:

```ts
const skinPositions = this.getSkinPositions(profileFile)
```

add:

```ts
const hitPosition = getHitPosition(skinPositions.hitPosition)
const outputSkinIni = path.join(outputPath, "skin.ini")

renderTemplateFile(outputSkinIni, {
  skin_name: skin.name,
  hit_position: hitPosition,
})
```

This occurs after `copyFilesToDirectory(templatesPath, outputPath)`, so only the copied output file
is rendered.

- [ ] **Step 3: Run focused and full verification**

Run:

```powershell
npm test
npm run typecheck
npx @biomejs/biome check src/transform/hitposition.ts src/transform/hitposition.test.ts src/utils/template.ts src/utils/template.test.ts src/engine/etterna/etterna.ts
git diff --check
```

Expected:

- All tests pass.
- TypeScript reports no errors.
- Biome reports no issues in the changed files, except any pre-existing line-ending issue in
  `src/engine/etterna/etterna.ts`; do not reformat unrelated lines merely to normalize the file.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Stop for user review**

Do not stage or commit. Report the changed files, verification evidence, and any pre-existing lint
issues so the user can review the implementation in the IDE.
