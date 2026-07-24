# Etterna-to-osu! Judgement Asset Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read the judgement sheet selected by Etterna profile `00000000` and publish the six semantic osu!mania judgements as SD and `@2x` PNG assets.

**Architecture:** Etterna-only adapters resolve the fixed profile GUID, safely parse `assetsConfig.lua`, validate `1x6`/`2x6` sheet metadata, and produce a format-neutral `JudgementSet`. Generic Sharp infrastructure extracts and scales frames, while an osu-only writer publishes the twelve target files without interpreting Etterna conventions.

**Tech Stack:** TypeScript, Node.js test runner, `luaparse`, Sharp 0.35, Biome, existing `settleAll` and transactional publisher.

## Global Constraints

- Apply only to the Etterna-to-osu! conversion direction.
- Support only `Save/LocalProfiles/00000000/Etterna.xml`.
- Extract exactly one non-empty `<Guid>` value.
- Parse Lua with `luaparse`; never execute `assetsConfig.lua`.
- Select `judgment[guid]`, falling back to `judgment.default` only when the GUID mapping is absent or its file is missing.
- Reject malformed configuration, unsafe paths, invalid layouts, and processing errors without fallback.
- Accept only filename-declared `1x6` and `2x6` sheets, case-insensitively.
- Use only the left/Early column of a `2x6` sheet.
- Map rows to `marvelous`, `perfect`, `great`, `good`, `bad`, and `miss`, in that order.
- Treat `(Doubleres)` case-insensitively as source density `2`; all other accepted sheets use density `1`.
- Always generate both `<grade>.png` and `<grade>@2x.png`.
- For density `1`, preserve the original as SD and enlarge HD to 200%.
- For density `2`, preserve the original as HD and reduce SD to 50%.
- Round fractional half-size dimensions with `Math.round`.
- Resize with Sharp's `lanczos3` kernel and preserve alpha.
- Do not trim, pad, rotate, reposition, or animate judgement frames.
- Keep the existing `skin.ini` judgement paths unchanged.
- Preserve receptor calibration `23`, notes, LNs, positions, cleanup, diagnostics, CLI behavior, and transactional publication.
- Keep all code, test names, comments, and documentation in English.
- Do not stage or commit; the user will review the working tree in the IDE.

---

## File Structure

- `src/adapters/etterna/image/parse-etterna-image-metadata.ts`: owns reusable Etterna filename layout and density metadata.
- `src/adapters/etterna/image/parse-etterna-image-metadata.test.ts`: protects current filename behavior and judgement decorations.
- `src/adapters/etterna/noteskin/resolve-skin-files.ts`: consumes the extracted metadata parser.
- `src/adapters/etterna/noteskin/resolve-skin-files.test.ts`: protects existing NoteSkin resolution behavior.
- `src/adapters/etterna/profile/read-etterna-profile-guid.ts`: reads the fixed profile's GUID.
- `src/adapters/etterna/profile/read-etterna-profile-guid.test.ts`: verifies XML path and scalar extraction.
- `src/infrastructure/lua/ast.ts`: supports identifier and bracketed-string fields on raw Lua tables.
- `src/infrastructure/lua/ast.test.ts`: protects generic raw-table lookup.
- `src/adapters/etterna/assets/read-etterna-judgement-selection.ts`: parses `assetsConfig.lua`, applies fallback, and resolves safe paths.
- `src/adapters/etterna/assets/read-etterna-judgement-selection.test.ts`: verifies selection, diagnostics, and security.
- `src/domain/judgement.ts`: defines semantic judgement grades and `JudgementSet`.
- `src/domain/skin.ts`: exposes judgements through `SkinAssets`.
- `src/adapters/etterna/judgements/analyze-etterna-judgement-sheet.ts`: validates a selected sheet and maps semantic frames.
- `src/adapters/etterna/judgements/analyze-etterna-judgement-sheet.test.ts`: verifies `1x6`, left-column `2x6`, density, and dimensions.
- `src/adapters/etterna/judgements/read-etterna-judgements.ts`: orchestrates GUID, selection, and sheet analysis.
- `src/adapters/etterna/reader/etterna-skin-reader.ts`: adds semantic judgements and diagnostics to the source model.
- `src/adapters/etterna/reader/etterna-skin-reader.test.ts`: verifies reader orchestration and preservation.
- `src/infrastructure/image/extract-image-frame.ts`: owns generic frame validation and extraction.
- `src/infrastructure/image/sharp-image-processor.ts`: consumes the extracted shared helper.
- `src/infrastructure/image/sharp-image-processor.test.ts`: protects receptor and note behavior after the refactor.
- `src/infrastructure/image/sharp-judgement-processor.ts`: renders SD and HD judgement buffers.
- `src/infrastructure/image/sharp-judgement-processor.test.ts`: verifies frame pixels, dimensions, alpha, and density conversion.
- `src/adapters/osu/writer/write-osu-judgements.ts`: renders and publishes all twelve osu! files.
- `src/adapters/osu/writer/write-osu-judgements.test.ts`: verifies filenames and quiescent failure semantics.
- `src/adapters/osu/writer/osu-skin-writer.ts`: requires and schedules judgement publication.
- `src/adapters/osu/writer/osu-skin-writer.test.ts`: verifies complete writer output and validation.
- `tests/integration/etterna-to-osu.test.ts`: covers XML, Lua config, selected `2x6` pixels, SD/HD output, and regressions.
- `readme.md`: documents selected-judgement migration.
- `docs/architecture.md`: documents adapter, domain, image, and writer responsibilities.

### Task 1: Extract Reusable Etterna Image Filename Metadata

**Files:**
- Create: `src/adapters/etterna/image/parse-etterna-image-metadata.ts`
- Create: `src/adapters/etterna/image/parse-etterna-image-metadata.test.ts`
- Modify: `src/adapters/etterna/noteskin/resolve-skin-files.ts`
- Verify: `src/adapters/etterna/noteskin/resolve-skin-files.test.ts`

**Interfaces:**
- Consumes: an image filename stem such as `Judgment Normal 2x6 (Doubleres)`.
- Produces: `parseEtternaImageMetadata(stem: string): EtternaImageMetadata`.
- Produces:

```ts
export interface EtternaImageMetadata {
  logicalStem: string
  columns: number
  rows: number
  doubleResolution: boolean
}
```

- [ ] **Step 1: Write failing metadata tests**

Create `src/adapters/etterna/image/parse-etterna-image-metadata.test.ts`:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { parseEtternaImageMetadata } from "./parse-etterna-image-metadata.ts"

test("parses Etterna layout and double-resolution decorations", () => {
  assert.deepEqual(parseEtternaImageMetadata("Judgment Normal 2x6 (Doubleres)"), {
    logicalStem: "Judgment Normal",
    columns: 2,
    rows: 6,
    doubleResolution: true,
  })
  assert.deepEqual(parseEtternaImageMetadata("default 1X6 (doubleres)"), {
    logicalStem: "default",
    columns: 1,
    rows: 6,
    doubleResolution: true,
  })
})

test("preserves undecorated and res-decorated filename behavior", () => {
  assert.deepEqual(parseEtternaImageMetadata("Tap Note"), {
    logicalStem: "Tap Note",
    columns: 1,
    rows: 1,
    doubleResolution: false,
  })
  assert.deepEqual(parseEtternaImageMetadata("Tap Note 3x8 (res 64x64)"), {
    logicalStem: "Tap Note",
    columns: 3,
    rows: 8,
    doubleResolution: false,
  })
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
node --test src/adapters/etterna/image/parse-etterna-image-metadata.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `parse-etterna-image-metadata.ts`.

- [ ] **Step 3: Implement the metadata parser**

Create `src/adapters/etterna/image/parse-etterna-image-metadata.ts`:

```ts
export interface EtternaImageMetadata {
  logicalStem: string
  columns: number
  rows: number
  doubleResolution: boolean
}

const layoutPattern = /\s(\d+)x(\d+)(?=\s*(?:\((?:doubleres|res [^)]*)\)\s*)*$)/i
const trailingMetadataPattern = /\s*\((?:doubleres|res [^)]*)\)\s*$/i

export function parseEtternaImageMetadata(stem: string): EtternaImageMetadata {
  const layout = layoutPattern.exec(stem)
  const trailingMetadata = trailingMetadataPattern.exec(stem)
  const decorationIndex = layout?.index ?? trailingMetadata?.index

  return {
    logicalStem:
      decorationIndex === undefined ? stem : stem.slice(0, decorationIndex).trimEnd(),
    columns: Number(layout?.[1] ?? 1),
    rows: Number(layout?.[2] ?? 1),
    doubleResolution: /\(doubleres\)/i.test(stem),
  }
}
```

- [ ] **Step 4: Replace the private NoteSkin parser**

In `src/adapters/etterna/noteskin/resolve-skin-files.ts`, import the new parser:

```ts
import { parseEtternaImageMetadata } from "../image/parse-etterna-image-metadata.ts"
```

Replace:

```ts
const { logicalStem, columns, rows } = parseDecoratedStem(stem)
```

with:

```ts
const { logicalStem, columns, rows } = parseEtternaImageMetadata(stem)
```

Replace the call in `normalizeRequestedName` the same way, then delete the private
`parseDecoratedStem` function.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test src/adapters/etterna/image/parse-etterna-image-metadata.test.ts src/adapters/etterna/noteskin/resolve-skin-files.test.ts
```

Expected: the new metadata tests and all existing NoteSkin resolver tests pass.

- [ ] **Step 6: Check task scope**

Run:

```powershell
git diff --check -- src/adapters/etterna/image src/adapters/etterna/noteskin/resolve-skin-files.ts
git diff --cached --name-only
```

Expected: no whitespace errors and no staged paths.

### Task 2: Read the Fixed Etterna Profile GUID

**Files:**
- Create: `src/adapters/etterna/profile/read-etterna-profile-guid.ts`
- Create: `src/adapters/etterna/profile/read-etterna-profile-guid.test.ts`

**Interfaces:**
- Consumes: the Etterna game root.
- Produces: `readEtternaProfileGuid(gameRoot: string): Promise<string>`.
- Produces: `extractEtternaProfileGuid(source: string, profilePath: string): string`.

- [ ] **Step 1: Write failing GUID tests**

Create `src/adapters/etterna/profile/read-etterna-profile-guid.test.ts`:

```ts
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  extractEtternaProfileGuid,
  readEtternaProfileGuid,
} from "./read-etterna-profile-guid.ts"

test("extracts the only non-empty Etterna profile GUID", () => {
  assert.equal(
    extractEtternaProfileGuid(
      "<Stats><Guid> a0e735211f55dfcd </Guid></Stats>",
      "Etterna.xml",
    ),
    "a0e735211f55dfcd",
  )
})

test("rejects missing, empty, or multiple GUID values", () => {
  assert.throws(() => extractEtternaProfileGuid("<Stats />", "Etterna.xml"), /exactly one.*Guid/i)
  assert.throws(
    () => extractEtternaProfileGuid("<Guid> </Guid>", "Etterna.xml"),
    /non-empty.*Guid/i,
  )
  assert.throws(
    () => extractEtternaProfileGuid("<Guid>one</Guid><Guid>two</Guid>", "Etterna.xml"),
    /exactly one.*Guid/i,
  )
})

test("reads profile 00000000 from the Etterna game root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-guid-"))
  try {
    const profileDirectory = path.join(root, "Save", "LocalProfiles", "00000000")
    await mkdir(profileDirectory, { recursive: true })
    await writeFile(path.join(profileDirectory, "Etterna.xml"), "<Guid>fixture-guid</Guid>")

    assert.equal(await readEtternaProfileGuid(root), "fixture-guid")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test src/adapters/etterna/profile/read-etterna-profile-guid.test.ts
```

Expected: FAIL because the GUID reader module does not exist.

- [ ] **Step 3: Implement the GUID reader**

Create `src/adapters/etterna/profile/read-etterna-profile-guid.ts`:

```ts
import { readFile } from "node:fs/promises"
import path from "node:path"

const supportedProfileId = "00000000"

export async function readEtternaProfileGuid(gameRoot: string): Promise<string> {
  const profilePath = path.join(
    gameRoot,
    "Save",
    "LocalProfiles",
    supportedProfileId,
    "Etterna.xml",
  )
  const source = await readFile(profilePath, "utf8")
  return extractEtternaProfileGuid(source, profilePath)
}

export function extractEtternaProfileGuid(source: string, profilePath: string): string {
  const matches = [...source.matchAll(/<Guid\b[^>]*>([\s\S]*?)<\/Guid>/gi)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one <Guid> in ${profilePath}`)
  }

  const guid = matches[0]?.[1]?.trim()
  if (!guid) {
    throw new Error(`Expected a non-empty <Guid> in ${profilePath}`)
  }
  return guid
}
```

- [ ] **Step 4: Run the GUID tests and verify GREEN**

Run:

```powershell
node --test src/adapters/etterna/profile/read-etterna-profile-guid.test.ts
```

Expected: all three GUID tests pass.

- [ ] **Step 5: Check task scope**

Run:

```powershell
git diff --check -- src/adapters/etterna/profile/read-etterna-profile-guid.ts src/adapters/etterna/profile/read-etterna-profile-guid.test.ts
git diff --cached --name-only
```

Expected: no whitespace errors and no staged paths.

### Task 3: Resolve the Selected Judgement with Safe Fallback

**Files:**
- Modify: `src/infrastructure/lua/ast.ts`
- Modify: `src/infrastructure/lua/ast.test.ts`
- Create: `src/adapters/etterna/assets/read-etterna-judgement-selection.ts`
- Create: `src/adapters/etterna/assets/read-etterna-judgement-selection.test.ts`

**Interfaces:**
- Consumes: an Etterna game root and profile GUID.
- Produces:

```ts
export interface EtternaJudgementSelection {
  filePath: string
  diagnostics: Diagnostic[]
}

export function readEtternaJudgementSelection(
  gameRoot: string,
  guid: string,
): Promise<EtternaJudgementSelection>
```

- [ ] **Step 1: Write failing selection and fallback tests**

Create `src/adapters/etterna/assets/read-etterna-judgement-selection.test.ts` with:

```ts
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { readEtternaJudgementSelection } from "./read-etterna-judgement-selection.ts"

interface SelectionFixture {
  root: string
  cleanup(): Promise<void>
}

async function createSelectionFixture(
  source: string,
  judgementFiles: readonly string[],
): Promise<SelectionFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-selection-"))
  const settings = path.join(root, "Save", "Rebirth_settings")
  const judgements = path.join(root, "Assets", "Judgments")
  await mkdir(settings, { recursive: true })
  await mkdir(judgements, { recursive: true })
  await writeFile(path.join(settings, "assetsConfig.lua"), source)
  await Promise.all(
    judgementFiles.map((filename) =>
      writeFile(path.join(judgements, filename), Buffer.from("fixture")),
    ),
  )
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}
```

Add these cases, registering cleanup immediately with `context.after`:

```ts
test("selects the GUID-specific judgement file", async (context) => {
  const fixture = await createSelectionFixture(`
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected 1x6.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `, ["selected 1x6.png", "default 1x6.png"])
  context.after(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid")

  assert.equal(result.filePath, path.join(fixture.root, "Assets", "Judgments", "selected 1x6.png"))
  assert.deepEqual(result.diagnostics, [])
})

test("uses the default and warns when the GUID mapping is absent", async (context) => {
  const fixture = await createSelectionFixture(`
    return { judgment = { default = "Assets/Judgments/default 1x6.png" } }
  `, ["default 1x6.png"])
  context.after(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid")

  assert.equal(path.basename(result.filePath), "default 1x6.png")
  assert.equal(result.diagnostics[0]?.severity, "warning")
  assert.match(result.diagnostics[0]?.message ?? "", /GUID.*default/i)
})

test("uses the default and warns when the selected file is missing", async (context) => {
  const fixture = await createSelectionFixture(`
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/missing 1x6.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `, ["default 1x6.png"])
  context.after(fixture.cleanup)

  const result = await readEtternaJudgementSelection(fixture.root, "fixtureguid")

  assert.equal(path.basename(result.filePath), "default 1x6.png")
  assert.match(result.diagnostics[0]?.message ?? "", /missing.*default/i)
})

test("rejects unsafe paths and unusable defaults", async (context) => {
  const unsafe = await createSelectionFixture(`
    return { judgment = { fixtureguid = "../outside.png", default = "Assets/Judgments/default 1x6.png" } }
  `, ["default 1x6.png"])
  context.after(unsafe.cleanup)
  await assert.rejects(
    () => readEtternaJudgementSelection(unsafe.root, "fixtureguid"),
    /unsafe.*judgement.*path/i,
  )

  const missingDefault = await createSelectionFixture(`
    return { judgment = { default = "Assets/Judgments/missing 1x6.png" } }
  `, [])
  context.after(missingDefault.cleanup)
  await assert.rejects(
    () => readEtternaJudgementSelection(missingDefault.root, "fixtureguid"),
    /default.*does not exist/i,
  )
})
```

Add a case with a valid selected file and an unsafe default path. It must reject, proving
both configured paths are safety-checked even when fallback is not needed:

```ts
test("rejects an unsafe default even when the selected file exists", async (context) => {
  const fixture = await createSelectionFixture(`
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected 1x6.png",
        default = "../outside.png",
      },
    }
  `, ["selected 1x6.png"])
  context.after(fixture.cleanup)

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid"),
    /unsafe.*judgement.*path/i,
  )
})
```

Add malformed, absolute-path, unsupported-extension, and always-required-default
coverage:

```ts
test("rejects malformed configuration with its path", async (context) => {
  const fixture = await createSelectionFixture("return { judgment = {", [])
  context.after(fixture.cleanup)

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid"),
    /assetsConfig\.lua/i,
  )
})

test("rejects absolute paths and unsupported image extensions", async (context) => {
  const absolute = await createSelectionFixture(`
    return {
      judgment = {
        fixtureguid = "/outside.png",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `, ["default 1x6.png"])
  context.after(absolute.cleanup)
  await assert.rejects(
    () => readEtternaJudgementSelection(absolute.root, "fixtureguid"),
    /unsafe.*judgement.*path/i,
  )

  const unsupported = await createSelectionFixture(`
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected.gif",
        default = "Assets/Judgments/default 1x6.png",
      },
    }
  `, ["selected.gif", "default 1x6.png"])
  context.after(unsupported.cleanup)
  await assert.rejects(
    () => readEtternaJudgementSelection(unsupported.root, "fixtureguid"),
    /unsupported.*judgement.*image/i,
  )
})

test("requires a usable default even when the selected file exists", async (context) => {
  const fixture = await createSelectionFixture(`
    return {
      judgment = {
        fixtureguid = "Assets/Judgments/selected 1x6.png",
        default = "Assets/Judgments/missing 1x6.png",
      },
    }
  `, ["selected 1x6.png"])
  context.after(fixture.cleanup)

  await assert.rejects(
    () => readEtternaJudgementSelection(fixture.root, "fixtureguid"),
    /default.*does not exist/i,
  )
})
```

- [ ] **Step 2: Run the selection tests and verify RED**

Run:

```powershell
node --test src/adapters/etterna/assets/read-etterna-judgement-selection.test.ts
```

Expected: FAIL because the selection reader module does not exist.

- [ ] **Step 3: Extend shared Lua table lookup**

Add this test to `src/infrastructure/lua/ast.test.ts`:

```ts
test("reads identifier and bracketed-string fields from raw Lua tables", () => {
  const ast = luaparse.parse(`
    return {
      judgment = {
        ["fixture-guid"] = "selected.png",
        default = "default.png",
      },
    }
  `)
  const statement = ast.body[0]
  assert.equal(statement?.type, "ReturnStatement")
  const root =
    statement?.type === "ReturnStatement"
      ? asAstObject(statement.arguments[0])
      : undefined
  const judgement = getTableField(root, "judgment")

  assert.equal(
    asAstObject(getTableField(judgement, "fixture-guid"))?.raw,
    '"selected.png"',
  )
  assert.equal(asAstObject(getTableField(judgement, "default"))?.raw, '"default.png"')
})
```

Update `getTableField` in `src/infrastructure/lua/ast.ts` so it accepts either a raw
`TableConstructorExpression` or the table argument of a `TableCallExpression`:

```ts
export function getTableField(
  tableLike: AstObject | undefined,
  expectedName: string,
): AstObject | undefined {
  const argumentTable = asAstObject(tableLike?.arguments)
  const rawFields = Array.isArray(tableLike?.fields)
    ? tableLike.fields
    : Array.isArray(argumentTable?.fields)
      ? argumentTable.fields
      : []

  for (const rawField of rawFields) {
    const field = asAstObject(rawField)
    const key = asAstObject(field?.key)
    const identifierKey =
      field?.type === "TableKeyString" && typeof key?.name === "string"
        ? key.name
        : undefined
    const stringKey =
      field?.type === "TableKey" && key?.type === "StringLiteral"
        ? readRawLuaString(key)
        : undefined

    if (identifierKey === expectedName || stringKey === expectedName) {
      return asAstObject(field?.value)
    }
  }
  return undefined
}

function readRawLuaString(value: AstObject): string | undefined {
  if (typeof value.value === "string") {
    return value.value
  }
  if (typeof value.raw !== "string") {
    return undefined
  }
  const quote = value.raw[0]
  return (quote === '"' || quote === "'") && value.raw.at(-1) === quote
    ? value.raw.slice(1, -1)
    : undefined
}
```

Run:

```powershell
node --test src/infrastructure/lua/ast.test.ts
```

Expected: existing traversal/call-table coverage and new raw-table coverage pass.

- [ ] **Step 4: Implement non-executing Lua configuration extraction**

In `read-etterna-judgement-selection.ts`, import `asAstObject` and `getTableField` from
the shared AST module and `evaluateLuaString` from the shared expression evaluator. Wrap
Lua syntax errors so malformed input still reports the configuration path:

```ts
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import luaparse, { type Chunk, type Expression } from "luaparse"
import type { Diagnostic } from "../../../domain/diagnostics.ts"
import { asAstObject, getTableField, type AstObject } from "../../../infrastructure/lua/ast.ts"
import { evaluateLuaString } from "../../../infrastructure/lua/evaluate-expression.ts"

function parseAssetConfig(source: string, configPath: string): Chunk {
  try {
    return luaparse.parse(source)
  } catch (cause) {
    throw new Error(`Could not parse Etterna asset configuration ${configPath}`, {
      cause,
    })
  }
}

const ast = parseAssetConfig(source, configPath)
const returnStatement = ast.body.find((statement) => statement.type === "ReturnStatement")
const returnedValue =
  returnStatement?.type === "ReturnStatement"
    ? returnStatement.arguments[0]
    : undefined
const root = requireTable(
  asAstObject(returnedValue),
  "returned value",
  configPath,
)
const judgement = requireTable(getTableField(root, "judgment"), "judgment", configPath)
const configured = readOptionalString(getTableField(judgement, guid), guid, configPath)
const fallback = readRequiredString(
  getTableField(judgement, "default"),
  "judgment.default",
  configPath,
)
```

Require both tables and read strings without evaluating calls:

```ts
function requireTable(value: AstObject | undefined, name: string, configPath: string): AstObject {
  if (value?.type !== "TableConstructorExpression") {
    throw new Error(`Expected ${name} to be a Lua table in ${configPath}`)
  }
  return value
}

function readRequiredString(
  value: AstObject | undefined,
  name: string,
  configPath: string,
): string {
  const result =
    value?.type === "StringLiteral"
      ? evaluateLuaString(value as Expression, {})
      : undefined
  if (!result) {
    throw new Error(`Expected ${name} to be a non-empty string in ${configPath}`)
  }
  return result
}

function readOptionalString(
  value: AstObject | undefined,
  name: string,
  configPath: string,
): string | undefined {
  if (!value) {
    return undefined
  }
  return readRequiredString(value, name, configPath)
}
```

Only string literal values are accepted. Missing `judgment`, missing default, non-string
values, and malformed Lua must throw errors that include the configuration path.

- [ ] **Step 5: Implement safe resolution and fallback**

Resolve configured paths with:

```ts
const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg"])

function resolveSafeCandidate(gameRoot: string, configuredPath: string): string {
  const normalizedParts = configuredPath.replace(/\\/g, "/").split("/")
  const hasFilesystemRoot =
    path.posix.isAbsolute(normalizedParts.join("/")) ||
    path.win32.parse(configuredPath).root !== ""
  if (hasFilesystemRoot || normalizedParts.includes("..")) {
    throw new Error(`Unsafe Etterna judgement path: ${configuredPath}`)
  }

  const root = path.resolve(gameRoot)
  const resolved = path.resolve(root, ...normalizedParts)
  const relative = path.relative(root, resolved)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe Etterna judgement path: ${configuredPath}`)
  }
  if (!supportedImageExtensions.has(path.extname(resolved).toLowerCase())) {
    throw new Error(`Unsupported Etterna judgement image: ${configuredPath}`)
  }
  return resolved
}
```

Call `resolveSafeCandidate` for both the GUID-specific path, when present, and the default
before checking either file.

Use `realpath` and `stat` to prevent an in-root symlink from resolving outside the game
root:

```ts
async function resolveExistingFile(
  gameRoot: string,
  candidate: string,
): Promise<string | undefined> {
  try {
    const [realRoot, realCandidate] = await Promise.all([
      realpath(gameRoot),
      realpath(candidate),
    ])
    const relative = path.relative(realRoot, realCandidate)
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`Unsafe Etterna judgement path: ${candidate}`)
    }
    const metadata = await stat(realCandidate)
    return metadata.isFile() ? realCandidate : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}
```

An unsafe real path is an error, not a missing-file fallback. Implement the selection
flow so the required default is confirmed as a regular in-root file even when the
GUID-specific file exists:

```ts
export async function readEtternaJudgementSelection(
  gameRoot: string,
  guid: string,
): Promise<EtternaJudgementSelection> {
  const configPath = path.join(gameRoot, "Save", "Rebirth_settings", "assetsConfig.lua")
  const source = await readFile(configPath, "utf8")
  const { configured, fallback } = extractConfiguredPaths(source, guid, configPath)
  const fallbackCandidate = resolveSafeCandidate(gameRoot, fallback)
  const configuredCandidate = configured
    ? resolveSafeCandidate(gameRoot, configured)
    : undefined
  const [configuredFile, fallbackFile] = await Promise.all([
    configuredCandidate
      ? resolveExistingFile(gameRoot, configuredCandidate)
      : Promise.resolve(undefined),
    resolveExistingFile(gameRoot, fallbackCandidate),
  ])

  if (!fallbackFile) {
    throw new Error(`Etterna default judgement does not exist: ${fallbackCandidate}`)
  }
  if (!configured) {
    return {
      filePath: fallbackFile,
      diagnostics: [missingGuidDiagnostic(guid, fallback)],
    }
  }
  if (!configuredFile) {
    return {
      filePath: fallbackFile,
      diagnostics: [missingFileDiagnostic(configured, fallback)],
    }
  }
  return { filePath: configuredFile, diagnostics: [] }
}
```

Keep the AST extraction in a private `extractConfiguredPaths` helper returning
`{ configured: string | undefined; fallback: string }`. Add warnings with stable codes:

```ts
function missingGuidDiagnostic(guid: string, fallback: string): Diagnostic {
  return {
    code: "etterna-judgement-default-used",
    severity: "warning",
    component: "judgements",
    message: `No judgement was configured for GUID ${guid}; using ${fallback}`,
  }
}
```

and:

```ts
function missingFileDiagnostic(configured: string, fallback: string): Diagnostic {
  return {
    code: "etterna-judgement-file-missing",
    severity: "warning",
    component: "judgements",
    message: `Configured judgement ${configured} does not exist; using ${fallback}`,
  }
}
```

- [ ] **Step 6: Run the selection tests and verify GREEN**

Run:

```powershell
node --test src/adapters/etterna/assets/read-etterna-judgement-selection.test.ts
```

Expected: GUID selection, both fallback cases, unsafe-path rejection, and missing-default
rejection pass.

- [ ] **Step 7: Run Lua and architecture regressions**

Run:

```powershell
node --test src/infrastructure/lua/*.test.ts src/adapters/etterna/assets/read-etterna-judgement-selection.test.ts
npm run test:architecture
```

Expected: all Lua tests and the architecture boundary test pass.

### Task 4: Build the Semantic Judgement Set and Integrate the Etterna Reader

**Files:**
- Create: `src/domain/judgement.ts`
- Modify: `src/domain/skin.ts`
- Create: `src/adapters/etterna/judgements/analyze-etterna-judgement-sheet.ts`
- Create: `src/adapters/etterna/judgements/analyze-etterna-judgement-sheet.test.ts`
- Create: `src/adapters/etterna/judgements/read-etterna-judgements.ts`
- Modify: `src/adapters/etterna/reader/etterna-skin-reader.ts`
- Modify: `src/adapters/etterna/reader/etterna-skin-reader.test.ts`

**Interfaces:**
- Produces:

```ts
export type JudgementGrade =
  | "marvelous"
  | "perfect"
  | "great"
  | "good"
  | "bad"
  | "miss"

export interface JudgementSet {
  sourceDensity: 1 | 2
  images: Record<JudgementGrade, ImageAsset>
}

export interface EtternaJudgementAnalysis {
  judgements: JudgementSet
  diagnostics: Diagnostic[]
}

export function analyzeEtternaJudgementSheet(filePath: string): Promise<JudgementSet>
export function readEtternaJudgements(gameRoot: string): Promise<EtternaJudgementAnalysis>
```

- [ ] **Step 1: Write failing sheet-analysis tests**

Create synthetic transparent PNG sheets with Sharp. Use these imports and helper so the
declared grid, pixel data, and alpha channel are deterministic:

```ts
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import { judgementGrades } from "../../../domain/judgement.ts"
import { analyzeEtternaJudgementSheet } from "./analyze-etterna-judgement-sheet.ts"

async function writeJudgementSheet(
  filePath: string,
  columns: number,
  rows: number,
  frameWidth: number,
  frameHeight: number,
): Promise<void> {
  const width = columns * frameWidth
  const height = rows * frameHeight
  const data = Buffer.alloc(width * height * 4)

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          const sourceX = column * frameWidth + x
          const sourceY = row * frameHeight + y
          const offset = (sourceY * width + sourceX) * 4
          data[offset] = row * 30
          data[offset + 1] = column * 120
          data[offset + 2] = 255 - row * 30
          data[offset + 3] = x === 0 && y === 0 ? 0 : 255
        }
      }
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(filePath)
}
```

In one test, create a temporary directory, register cleanup with `t.after`, and write:

```ts
const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-sheet-"))
t.after(() => rm(directory, { recursive: true, force: true }))

const oneBySixPath = path.join(directory, "Fixture 1x6.png")
const twoBySixDoubleresPath = path.join(directory, "Fixture 2x6 (Doubleres).png")
await writeJudgementSheet(oneBySixPath, 1, 6, 7, 5)
await writeJudgementSheet(twoBySixDoubleresPath, 2, 6, 7, 5)
```

Assert:

```ts
const oneColumn = await analyzeEtternaJudgementSheet(oneBySixPath)
assert.equal(oneColumn.sourceDensity, 1)
assert.deepEqual(
  judgementGrades.map((grade) => oneColumn.images[grade].frame?.index),
  [0, 1, 2, 3, 4, 5],
)

const twoColumns = await analyzeEtternaJudgementSheet(twoBySixDoubleresPath)
assert.equal(twoColumns.sourceDensity, 2)
assert.deepEqual(
  judgementGrades.map((grade) => twoColumns.images[grade].frame?.index),
  [0, 2, 4, 6, 8, 10],
)
```

Add rejection assertions:

```ts
const noLayoutPath = path.join(directory, "No Layout.png")
const threeBySixPath = path.join(directory, "Invalid 3x6.png")
const indivisiblePath = path.join(directory, "Invalid 2x6.png")
await writeJudgementSheet(noLayoutPath, 1, 6, 7, 5)
await writeJudgementSheet(threeBySixPath, 3, 6, 7, 5)
await sharp({
  create: {
    width: 15,
    height: 36,
    channels: 4,
    background: { r: 255, g: 0, b: 0, alpha: 1 },
  },
})
  .png()
  .toFile(indivisiblePath)

await assert.rejects(() => analyzeEtternaJudgementSheet(noLayoutPath), /expected 1x6 or 2x6/i)
await assert.rejects(() => analyzeEtternaJudgementSheet(threeBySixPath), /expected 1x6 or 2x6/i)
await assert.rejects(() => analyzeEtternaJudgementSheet(indivisiblePath), /dimensions.*layout/i)
```

- [ ] **Step 2: Run sheet-analysis tests and verify RED**

Run:

```powershell
node --test src/adapters/etterna/judgements/analyze-etterna-judgement-sheet.test.ts
```

Expected: FAIL because the domain and analyzer modules do not exist.

- [ ] **Step 3: Add the domain model**

Create `src/domain/judgement.ts`:

```ts
import type { ImageAsset } from "./image.ts"

export const judgementGrades = [
  "marvelous",
  "perfect",
  "great",
  "good",
  "bad",
  "miss",
] as const

export type JudgementGrade = (typeof judgementGrades)[number]

export interface JudgementSet {
  sourceDensity: 1 | 2
  images: Record<JudgementGrade, ImageAsset>
}
```

Extend `SkinAssets` in `src/domain/skin.ts`:

```ts
import type { JudgementSet } from "./judgement.ts"

export interface SkinAssets {
  receptors?: ReceptorSet
  tapNotes?: TapNoteSet
  judgements?: JudgementSet
}
```

- [ ] **Step 4: Implement sheet analysis**

Use `parseEtternaImageMetadata(path.basename(filePath, path.extname(filePath)))` and Sharp
metadata. Validate exact layouts and divisibility before building:

```ts
const rowsByGrade: Record<JudgementGrade, number> = {
  marvelous: 0,
  perfect: 1,
  great: 2,
  good: 3,
  bad: 4,
  miss: 5,
}

const images = Object.fromEntries(
  judgementGrades.map((grade) => [
    grade,
    {
      filePath,
      rotation: 0,
      frame: {
        index: rowsByGrade[grade] * columns,
        columns,
        rows,
      },
    },
  ]),
) as Record<JudgementGrade, ImageAsset>

return {
  sourceDensity: doubleResolution ? 2 : 1,
  images,
}
```

Require metadata width and height, `rows === 6`, `columns === 1 || columns === 2`,
`width % columns === 0`, and `height % rows === 0`.

- [ ] **Step 5: Run sheet-analysis tests and verify GREEN**

Run:

```powershell
node --test src/adapters/etterna/judgements/analyze-etterna-judgement-sheet.test.ts
```

Expected: frame mapping, density, layout rejection, and dimension rejection pass.

- [ ] **Step 6: Write failing Etterna reader assertions**

Extend `EtternaSkinReaderDependencies` test setup with:

```ts
const judgements: JudgementSet = {
  sourceDensity: 1,
  images: Object.fromEntries(
    judgementGrades.map((grade) => [grade, image]),
  ) as JudgementSet["images"],
}

analyzeJudgements: async () => ({
  judgements,
  diagnostics: [
    {
      code: "fixture-warning",
      severity: "warning",
      component: "judgements",
      message: "fixture fallback",
    },
  ],
}),
```

Assert:

```ts
assert.equal(skin.assets.judgements, judgements)
assert.deepEqual(skin.diagnostics, [
  {
    code: "fixture-warning",
    severity: "warning",
    component: "judgements",
    message: "fixture fallback",
  },
])
```

Run:

```powershell
node --test src/adapters/etterna/reader/etterna-skin-reader.test.ts
```

Expected: FAIL because the reader does not call or publish judgement analysis.

- [ ] **Step 7: Implement judgement orchestration and reader integration**

Create `read-etterna-judgements.ts`:

```ts
import type { Diagnostic } from "../../../domain/diagnostics.ts"
import type { JudgementSet } from "../../../domain/judgement.ts"
import { readEtternaJudgementSelection } from "../assets/read-etterna-judgement-selection.ts"
import { readEtternaProfileGuid } from "../profile/read-etterna-profile-guid.ts"
import { analyzeEtternaJudgementSheet } from "./analyze-etterna-judgement-sheet.ts"

export interface EtternaJudgementAnalysis {
  judgements: JudgementSet
  diagnostics: Diagnostic[]
}

export async function readEtternaJudgements(
  gameRoot: string,
): Promise<EtternaJudgementAnalysis> {
  const guid = await readEtternaProfileGuid(gameRoot)
  const selection = await readEtternaJudgementSelection(gameRoot, guid)
  return {
    judgements: await analyzeEtternaJudgementSheet(selection.filePath),
    diagnostics: selection.diagnostics,
  }
}
```

Add `analyzeJudgements(gameRoot)` to `EtternaSkinReaderDependencies`, defaulting to
`readEtternaJudgements`. Load it in the first `Promise.all`:

```ts
const [playfield, context, judgementAnalysis] = await Promise.all([
  this.#dependencies.readProfile(reference.gameRoot),
  this.#dependencies.loadNoteSkinContext(reference.sourcePath),
  this.#dependencies.analyzeJudgements(reference.gameRoot),
])
```

Add `judgements: judgementAnalysis.judgements` to assets and append
`judgementAnalysis.diagnostics` after receptor and note diagnostics.

- [ ] **Step 8: Run reader and analyzer tests and verify GREEN**

Run:

```powershell
node --test src/adapters/etterna/judgements/*.test.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts
```

Expected: all sheet analysis and reader orchestration tests pass.

### Task 5: Render SD and HD Judgement Variants with Sharp

**Files:**
- Create: `src/infrastructure/image/extract-image-frame.ts`
- Modify: `src/infrastructure/image/sharp-image-processor.ts`
- Verify: `src/infrastructure/image/sharp-image-processor.test.ts`
- Create: `src/infrastructure/image/sharp-judgement-processor.ts`
- Create: `src/infrastructure/image/sharp-judgement-processor.test.ts`

**Interfaces:**
- Produces:

```ts
export interface JudgementImageVariants {
  standardResolution: Buffer
  doubleResolution: Buffer
}

export function renderJudgementImageVariants(
  definition: ImageAsset,
  sourceDensity: 1 | 2,
): Promise<JudgementImageVariants>
```

- [ ] **Step 1: Extract the existing generic frame helper without changing behavior**

Move the existing private `extractImageFrame` implementation verbatim from
`sharp-image-processor.ts` to `extract-image-frame.ts` and export:

```ts
export async function extractImageFrame(
  definition: Pick<ImageAsset, "filePath" | "frame">,
): Promise<string | Buffer>
```

Import it back into `sharp-image-processor.ts`. Run:

```powershell
node --test src/infrastructure/image/sharp-image-processor.test.ts
```

Expected: all existing receptor and note image tests remain green before judgement
behavior is added.

- [ ] **Step 2: Write failing judgement-renderer tests**

Create `sharp-judgement-processor.test.ts` with a synthetic two-column frame whose
selected frame contains one transparent pixel and differs from its sibling. Use:

```ts
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"
import { renderJudgementImageVariants } from "./sharp-judgement-processor.ts"

async function writeTwoColumnSheet(
  filePath: string,
  frameWidth: number,
  frameHeight: number,
): Promise<ImageAsset> {
  const width = frameWidth * 2
  const data = Buffer.alloc(width * frameHeight * 4)
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const isSelectedFrame = x < frameWidth
      data[offset] = isSelectedFrame ? 255 : 0
      data[offset + 1] = 0
      data[offset + 2] = isSelectedFrame ? 0 : 255
      data[offset + 3] = isSelectedFrame && x === 0 && y === 0 ? 0 : 255
    }
  }
  await sharp(data, { raw: { width, height: frameHeight, channels: 4 } })
    .png()
    .toFile(filePath)
  return {
    filePath,
    rotation: 0,
    frame: { index: 0, columns: 2, rows: 1 },
  }
}

async function dimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer).metadata()
  assert.ok(metadata.width)
  assert.ok(metadata.height)
  return { width: metadata.width, height: metadata.height }
}

async function alphaAt(buffer: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  const alpha = data[(y * info.width + x) * 4 + 3]
  assert.ok(alpha !== undefined)
  return alpha
}
```

Each test creates a temporary directory and registers:

```ts
t.after(() => rm(directory, { recursive: true, force: true }))
```

For density `1`, assert:

```ts
const asset = await writeTwoColumnSheet(path.join(directory, "standard.png"), 6, 4)
const variants = await renderJudgementImageVariants(asset, 1)
assert.deepEqual(await dimensions(variants.standardResolution), { width: 6, height: 4 })
assert.deepEqual(await dimensions(variants.doubleResolution), { width: 12, height: 8 })
assert.equal(await alphaAt(variants.standardResolution, 0, 0), 0)
```

For density `2`, use a selected frame sized `9x7` and assert:

```ts
const asset = await writeTwoColumnSheet(path.join(directory, "double.png"), 9, 7)
const variants = await renderJudgementImageVariants(asset, 2)
assert.deepEqual(await dimensions(variants.standardResolution), { width: 5, height: 4 })
assert.deepEqual(await dimensions(variants.doubleResolution), { width: 9, height: 7 })
```

The `5x4` expectation proves `Math.round(9 / 2)` and `Math.round(7 / 2)`.

- [ ] **Step 3: Run renderer tests and verify RED**

Run:

```powershell
node --test src/infrastructure/image/sharp-judgement-processor.test.ts
```

Expected: FAIL because `sharp-judgement-processor.ts` does not exist.

- [ ] **Step 4: Implement judgement variant rendering**

Create `sharp-judgement-processor.ts`:

```ts
import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"
import { extractImageFrame } from "./extract-image-frame.ts"

export interface JudgementImageVariants {
  standardResolution: Buffer
  doubleResolution: Buffer
}

export async function renderJudgementImageVariants(
  definition: ImageAsset,
  sourceDensity: 1 | 2,
): Promise<JudgementImageVariants> {
  const extracted = await extractImageFrame(definition)
  const original = await sharp(extracted).ensureAlpha().png().toBuffer()
  const metadata = await sharp(original).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not render judgement ${definition.filePath}`)
  }

  const resize = (width: number, height: number) =>
    sharp(original)
      .resize({
        width,
        height,
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .ensureAlpha()
      .png()
      .toBuffer()

  if (sourceDensity === 1) {
    return {
      standardResolution: original,
      doubleResolution: await resize(metadata.width * 2, metadata.height * 2),
    }
  }

  const standardWidth = Math.round(metadata.width / 2)
  const standardHeight = Math.round(metadata.height / 2)
  if (standardWidth < 1 || standardHeight < 1) {
    throw new Error(`Judgement dimensions must remain positive: ${definition.filePath}`)
  }
  return {
    standardResolution: await resize(standardWidth, standardHeight),
    doubleResolution: original,
  }
}
```

- [ ] **Step 5: Run infrastructure image tests and verify GREEN**

Run:

```powershell
node --test src/infrastructure/image/sharp-judgement-processor.test.ts src/infrastructure/image/sharp-image-processor.test.ts
```

Expected: judgement SD/HD, selected-frame, alpha, and rounding assertions pass; every
existing receptor and note processor test remains green.

- [ ] **Step 6: Run type and architecture checks**

Run:

```powershell
npm run typecheck
npm run test:architecture
git diff --check -- src/infrastructure/image
```

Expected: no TypeScript errors, architecture violations, cycles, or whitespace errors.

### Task 6: Publish Judgements from the osu! Writer

**Files:**
- Create: `src/adapters/osu/writer/write-osu-judgements.ts`
- Create: `src/adapters/osu/writer/write-osu-judgements.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Verify: `src/adapters/osu/templates/render-osu-template.test.ts`

**Interfaces:**
- Consumes: `JudgementSet` and output workspace.
- Produces:

```ts
export interface WriteOsuJudgementsOptions {
  judgements: JudgementSet
  outputDirectory: string
  render?: JudgementRenderer
  write?: JudgementWriter
}

export function writeOsuJudgements(options: WriteOsuJudgementsOptions): Promise<void>
```

- [ ] **Step 1: Write failing filename and render-phase tests**

Create `write-osu-judgements.test.ts` with:

```ts
import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  judgementGrades,
  type JudgementGrade,
  type JudgementSet,
} from "../../../domain/judgement.ts"
import { writeOsuJudgements } from "./write-osu-judgements.ts"

const judgements: JudgementSet = {
  sourceDensity: 1,
  images: Object.fromEntries(
    judgementGrades.map((grade) => [
      grade,
      { filePath: grade, rotation: 0 },
    ]),
  ) as JudgementSet["images"],
}
```

Use `definition.filePath` as the grade identifier in the injected renderer:

```ts
render: async (definition) => {
  const grade = definition.filePath as JudgementGrade
  return {
    standardResolution: Buffer.from(`sd-${grade}`),
    doubleResolution: Buffer.from(`hd-${grade}`),
  }
},
```

After `writeOsuJudgements`, assert the sorted directory listing equals:

```ts
[
  "bad.png",
  "bad@2x.png",
  "good.png",
  "good@2x.png",
  "great.png",
  "great@2x.png",
  "marvelous.png",
  "marvelous@2x.png",
  "miss.png",
  "miss@2x.png",
  "perfect.png",
  "perfect@2x.png",
]
```

Add a render failure test that injects one unresolved deferred renderer and one exact
error:

```ts
const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-writer-"))
t.after(() => rm(outputDirectory, { recursive: true, force: true }))
const sibling = deferred<JudgementImageVariants>()
const failureStarted = deferred<void>()
const failure = new Error("exact judgement render failure")
let calls = 0

const writing = writeOsuJudgements({
  judgements,
  outputDirectory,
  render: async () => {
    calls += 1
    if (calls === 1) {
      return sibling.promise
    }
    if (calls === 2) {
      failureStarted.resolve()
      throw failure
    }
    return {
      standardResolution: Buffer.from("sd"),
      doubleResolution: Buffer.from("hd"),
    }
  },
})
let settled = false
void writing.catch(() => {
  settled = true
})

await failureStarted.promise
await new Promise<void>((resolve) => setImmediate(resolve))
assert.equal(settled, false)

sibling.resolve({
  standardResolution: Buffer.from("sd"),
  doubleResolution: Buffer.from("hd"),
})
await assert.rejects(writing, (error) => error === failure)
assert.deepEqual(await readdir(outputDirectory), [])
```

Add this local helper and import `JudgementImageVariants` from the Sharp processor:

```ts
interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
```

- [ ] **Step 2: Run writer tests and verify RED**

Run:

```powershell
node --test src/adapters/osu/writer/write-osu-judgements.test.ts
```

Expected: FAIL because the judgement writer does not exist.

- [ ] **Step 3: Implement render-first judgement publication**

Create `write-osu-judgements.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset } from "../../../domain/image.ts"
import {
  judgementGrades,
  type JudgementSet,
} from "../../../domain/judgement.ts"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  type JudgementImageVariants,
  renderJudgementImageVariants,
} from "../../../infrastructure/image/sharp-judgement-processor.ts"

export type JudgementRenderer = (
  definition: ImageAsset,
  sourceDensity: 1 | 2,
) => Promise<JudgementImageVariants>
export type JudgementWriter = (filePath: string, buffer: Buffer) => Promise<void>

export interface WriteOsuJudgementsOptions {
  judgements: JudgementSet
  outputDirectory: string
  render?: JudgementRenderer
  write?: JudgementWriter
}

export async function writeOsuJudgements(options: WriteOsuJudgementsOptions): Promise<void> {
  const render = options.render ?? renderJudgementImageVariants
  const write = options.write ?? writeFile
  const prepared = await settleAll(
    judgementGrades.map(async (grade) => ({
      grade,
      variants: await render(
        options.judgements.images[grade],
        options.judgements.sourceDensity,
      ),
    })),
  )

  const outputDirectory = path.join(options.outputDirectory, "mania", "judgements")
  await mkdir(outputDirectory, { recursive: true })
  await settleAll(
    prepared.flatMap(({ grade, variants }) => [
      write(path.join(outputDirectory, `${grade}.png`), variants.standardResolution),
      write(path.join(outputDirectory, `${grade}@2x.png`), variants.doubleResolution),
    ]),
  )
}
```

- [ ] **Step 4: Add deterministic write-failure coverage**

Inject twelve writes where one sibling is deferred and another throws an exact error.
Use this exact synchronization:

```ts
const sibling = deferred<void>()
const writesStarted = deferred<void>()
const failure = new Error("exact judgement write failure")
let calls = 0

const writing = writeOsuJudgements({
  judgements,
  outputDirectory,
  render: async () => ({
    standardResolution: Buffer.from("sd"),
    doubleResolution: Buffer.from("hd"),
  }),
  write: async () => {
    calls += 1
    if (calls === 12) {
      writesStarted.resolve()
    }
    if (calls === 1) {
      return sibling.promise
    }
    if (calls === 2) {
      throw failure
    }
  },
})

const phase = await Promise.race([
  writesStarted.promise.then(() => "started"),
  writing.then(
    () => "completed",
    () => "rejected",
  ),
])
assert.equal(phase, "started")

let settled = false
void writing.catch(() => {
  settled = true
})
await Promise.resolve()
assert.equal(settled, false)

sibling.resolve()
await assert.rejects(writing, (error) => error === failure)
```

- [ ] **Step 5: Integrate the main osu! writer**

In `osu-skin-writer.ts`, require:

```ts
const judgements = skin.assets.judgements
if (!judgements) {
  throw new Error("osu skin model does not contain judgements")
}
```

Import `writeOsuJudgements` and add:

```ts
writeOsuJudgements({
  judgements,
  outputDirectory: workspace,
}),
```

to the existing outer `settleAll` batch.

Update `completeOsuSkin` in `osu-skin-writer.test.ts`:

```ts
const judgements: JudgementSet = {
  sourceDensity: 1,
  images: Object.fromEntries(
    judgementGrades.map((grade) => [grade, image]),
  ) as JudgementSet["images"],
}
```

Return `assets: { receptors, tapNotes, judgements }`. Assert the complete writer creates
`mania/judgements/marvelous.png` and `mania/judgements/marvelous@2x.png`.

Extend the incomplete-model test by supplying receptors and tap notes but omitting
judgements. Keep validation before any template filesystem access and assert:

```ts
const complete = completeOsuSkin("source.png")
const withoutJudgements: SkinModel = {
  ...complete,
  assets: {
    receptors: complete.assets.receptors,
    tapNotes: complete.assets.tapNotes,
  },
}
await assert.rejects(
  () => writer.writeSkin(withoutJudgements, "workspace"),
  /does not contain judgements/i,
)
```

- [ ] **Step 6: Run focused osu! tests and verify GREEN**

Run:

```powershell
node --test src/adapters/osu/writer/write-osu-judgements.test.ts src/adapters/osu/writer/osu-skin-writer.test.ts src/adapters/osu/templates/render-osu-template.test.ts
```

Expected: all twelve-filename, quiescence, complete-writer, validation, and unchanged
production-template assertions pass.

### Task 7: Verify the Complete Conversion and Document It

**Files:**
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: fixed profile XML, assets configuration, a selected `2x6 (Doubleres)` sheet,
  the real reader/conversion/writer/publisher pipeline.
- Produces: twelve target PNG files containing the six left/Early frames at correct SD/HD
  dimensions.

- [ ] **Step 1: Extend the integration fixture**

Create:

```ts
const profileRoot = path.join(gameRoot, "Save", "LocalProfiles", "00000000")
const assetsSettingsDirectory = path.join(gameRoot, "Save", "Rebirth_settings")
const judgementDirectory = path.join(gameRoot, "Assets", "Judgments")
const judgementPath = path.join(
  judgementDirectory,
  "Fixture Judgment 2x6 (Doubleres).png",
)
const defaultJudgementPath = path.join(
  judgementDirectory,
  "default 1x6 (Doubleres).png",
)
```

Write:

```xml
<Stats>
  <Guid>fixtureguid</Guid>
</Stats>
```

to `profileRoot/Etterna.xml`, and:

```lua
return {
  judgment = {
    fixtureguid = "Assets/Judgments/Fixture Judgment 2x6 (Doubleres).png",
    default = "Assets/Judgments/default 1x6 (Doubleres).png",
  },
}
```

to `Save/Rebirth_settings/assetsConfig.lua`.

Create `profileRoot`, `assetsSettingsDirectory`, and `judgementDirectory` recursively.
Write a valid regular PNG to `defaultJudgementPath`, because the configuration contract
requires a usable default even when the GUID-specific selection exists:

```ts
await sharp({
  create: {
    width: 8,
    height: 36,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .png()
  .toFile(defaultJudgementPath)
```

Add these exact lines to the integration fixture's `skin.ini`, preserving them in its
final expected string:

```ini
Hit0: mania\judgements\miss
Hit50: mania\judgements\bad
Hit100: mania\judgements\good
Hit200: mania\judgements\great
Hit300: mania\judgements\perfect
Hit300g: mania\judgements\marvelous
```

Build the selected `2x6` sheet with this helper:

```ts
const leftColors = [
  { r: 255, g: 0, b: 0 },
  { r: 255, g: 128, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 128, b: 255 },
  { r: 255, g: 0, b: 255 },
] as const

async function writeTwoBySixJudgementSheet(filePath: string): Promise<void> {
  const frameWidth = 8
  const frameHeight = 6
  const width = frameWidth * 2
  const height = frameHeight * 6
  const data = Buffer.alloc(width * height * 4)

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const color =
        column === 0 ? leftColors[row]! : { r: 16, g: row * 20, b: 16 }
      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          const sourceX = column * frameWidth + x
          const sourceY = row * frameHeight + y
          const offset = (sourceY * width + sourceX) * 4
          data[offset] = color.r
          data[offset + 1] = color.g
          data[offset + 2] = color.b
          data[offset + 3] = 255
        }
      }
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(filePath)
}
```

Call `writeTwoBySixJudgementSheet(judgementPath)`. The complete sheet is `16x36`, so
each generated SD file must be `4x3` and each HD file `8x6`.

- [ ] **Step 2: Add exact end-to-end judgement assertions**

Import:

```ts
import {
  judgementGrades,
  type JudgementGrade,
} from "../../src/domain/judgement.ts"
```

After conversion, iterate:

```ts
const expectedLeftColors = Object.fromEntries(
  judgementGrades.map((grade, index) => [grade, leftColors[index]]),
) as Record<JudgementGrade, (typeof leftColors)[number]>
```

For every entry, read `<grade>.png` and `<grade>@2x.png`, assert dimensions `4x3` and
`8x6`, and assert a center pixel matches the left-frame color:

```ts
for (const [grade, color] of Object.entries(expectedLeftColors)) {
  for (const [suffix, expectedDimensions] of [
    [".png", { width: 4, height: 3 }],
    ["@2x.png", { width: 8, height: 6 }],
  ] as const) {
    const { data, info } = await sharp(
      path.join(outputDirectory, "mania", "judgements", `${grade}${suffix}`),
    )
      .raw()
      .toBuffer({ resolveWithObject: true })
    assert.deepEqual(
      { width: info.width, height: info.height },
      expectedDimensions,
    )
    const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4
    assert.deepEqual([...data.subarray(offset, offset + 3)], [color.r, color.g, color.b])
  }
}
```

Also assert the sorted judgement directory contains exactly the twelve filenames from
Task 6.

Keep every existing `skin.ini`, stale-output, receptor bounds, note dimensions, LN bytes,
template cleanup, and diagnostics assertion.

- [ ] **Step 3: Run the integration test and verify GREEN**

Run:

```powershell
node --test tests/integration/etterna-to-osu.test.ts
```

Expected: the real XML-to-output integration test passes with all existing and new
assertions.

- [ ] **Step 4: Document selection and output behavior**

Add to `readme.md`:

```markdown
The Etterna reader resolves the judgement selected for profile `00000000` from
`Etterna.xml` and `Save/Rebirth_settings/assetsConfig.lua`. It accepts `1x6` and
`2x6` sheets, uses the left/Early column, and maps W1 through Miss to
`marvelous`, `perfect`, `great`, `good`, `bad`, and `miss`.

Every grade is written as both SD and `@2x`. `(Doubleres)` sources preserve the
original as `@2x` and generate SD at 50%; standard sources preserve the original
as SD and generate `@2x` at 200%.
```

Update the assets/conversions section of `docs/architecture.md`:

```markdown
Etterna asset adapters resolve the fixed profile's selected judgement and convert
Etterna sheet coordinates into a semantic `JudgementSet`. The conversion preserves
that format-neutral set. Generic Sharp infrastructure extracts and scales frames,
while the osu! writer publishes the named SD and HD judgement files.
```

- [ ] **Step 5: Run complete verification**

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
- All unit and integration tests pass.
- TypeScript reports no errors.
- Architecture boundaries contain no violations or cycles.
- Git reports no whitespace errors.
- The cached path list is empty.
- The existing `skin.ini` edit and every judgement feature change remain unstaged and
  uncommitted for IDE review.
