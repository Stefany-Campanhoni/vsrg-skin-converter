# osu! Long-Note Template Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy the fixed osu! long-note body and tail templates to their final `skin.ini` paths without transformation and remove internal template artifacts before completing the staged workspace.

**Architecture:** A focused osu! long-note writer owns the explicit binary-copy mapping from root template assets to final LN paths. A separate finalizer removes only named internal template artifacts after receptors, tap notes, and long notes all finish successfully. `OsuSkinWriter` coordinates these target-specific steps while the existing transactional publisher protects the current published output.

**Tech Stack:** TypeScript, Node.js filesystem promises, Node.js test runner, Biome, architecture boundary tests.

## Global Constraints

- Apply only to the existing Etterna-to-osu! output flow.
- Copy `LNB.png` byte-for-byte to `mania/lns/body.png`.
- Copy `LNT.png` byte-for-byte to `mania/lns/tail.png`.
- Do not use Sharp or perform resizing, rotation, recoloring, or recompression.
- Continue sharing the two assets across all four columns through the existing `skin.ini` paths.
- Remove only `receptor-base.png`, `LNB.png`, and `LNT.png` from the workspace root after every build task succeeds.
- Do not scan for disposable files or delete files by wildcard.
- A missing source asset or cleanup failure must fail the staged workspace build.
- Do not stage or commit; the user will review the working tree in the IDE.

---

## File Structure

- `src/adapters/osu/writer/write-osu-long-notes.ts`: owns the fixed source-to-destination mapping and byte-preserving copies.
- `src/adapters/osu/writer/write-osu-long-notes.test.ts`: verifies exact bytes, paths, directory creation, and missing-source failure.
- `src/adapters/osu/writer/remove-osu-template-artifacts.ts`: owns the allowlist of root template artifacts and final cleanup.
- `src/adapters/osu/writer/remove-osu-template-artifacts.test.ts`: verifies exact removal and preservation of generated files.
- `src/adapters/osu/writer/osu-skin-writer.ts`: coordinates long-note publication and cleanup timing.
- `src/adapters/osu/writer/osu-skin-writer.test.ts`: verifies the completed workspace and failed long-note build behavior.
- `tests/integration/etterna-to-osu.test.ts`: verifies byte-identical final LN files and absence of root artifacts.
- `readme.md`: documents fixed long-note publication.
- `docs/architecture.md`: documents writer ownership and cleanup boundary.

### Task 1: Publish Fixed Long-Note Assets

**Files:**

- Create: `src/adapters/osu/writer/write-osu-long-notes.test.ts`
- Create: `src/adapters/osu/writer/write-osu-long-notes.ts`

**Interfaces:**

- Consumes: a workspace directory that already contains copied `LNB.png` and `LNT.png`.
- Produces: `writeOsuLongNotes(options: WriteOsuLongNotesOptions): Promise<void>`.

- [ ] **Step 1: Write the failing long-note publisher tests**

Create `src/adapters/osu/writer/write-osu-long-notes.test.ts`:

```ts
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { writeOsuLongNotes } from "./write-osu-long-notes.ts"

test("copies fixed long-note assets byte-for-byte to the osu template paths", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-lns-"))
  const body = Buffer.from([1, 2, 3, 4])
  const tail = Buffer.from([5, 6, 7])
  try {
    await writeFile(path.join(workspace, "LNB.png"), body)
    await writeFile(path.join(workspace, "LNT.png"), tail)

    await writeOsuLongNotes({ outputDirectory: workspace })

    assert.deepEqual(await readFile(path.join(workspace, "mania", "lns", "body.png")), body)
    assert.deepEqual(await readFile(path.join(workspace, "mania", "lns", "tail.png")), tail)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test("rejects when a required long-note template asset is missing", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-lns-"))
  try {
    await writeFile(path.join(workspace, "LNB.png"), "body")

    await assert.rejects(
      () => writeOsuLongNotes({ outputDirectory: workspace }),
      { code: "ENOENT" },
    )
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test src/adapters/osu/writer/write-osu-long-notes.test.ts
```

Expected: FAIL because `write-osu-long-notes.ts` does not exist.

- [ ] **Step 3: Implement the binary-copy mapping**

Create `src/adapters/osu/writer/write-osu-long-notes.ts`:

```ts
import { copyFile, mkdir } from "node:fs/promises"
import path from "node:path"

const longNoteTemplateAssets = [
  { sourceFilename: "LNB.png", outputFilename: "body.png" },
  { sourceFilename: "LNT.png", outputFilename: "tail.png" },
] as const

export interface WriteOsuLongNotesOptions {
  outputDirectory: string
}

export async function writeOsuLongNotes(options: WriteOsuLongNotesOptions): Promise<void> {
  const longNoteDirectory = path.join(options.outputDirectory, "mania", "lns")
  await mkdir(longNoteDirectory, { recursive: true })
  await Promise.all(
    longNoteTemplateAssets.map(({ sourceFilename, outputFilename }) =>
      copyFile(
        path.join(options.outputDirectory, sourceFilename),
        path.join(longNoteDirectory, outputFilename),
      ),
    ),
  )
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test src/adapters/osu/writer/write-osu-long-notes.test.ts
```

Expected: 2 tests pass.

### Task 2: Remove Only Known Template Artifacts

**Files:**

- Create: `src/adapters/osu/writer/remove-osu-template-artifacts.test.ts`
- Create: `src/adapters/osu/writer/remove-osu-template-artifacts.ts`

**Interfaces:**

- Consumes: a successfully built osu! workspace.
- Produces: `removeOsuTemplateArtifacts(outputDirectory: string): Promise<void>`.

- [ ] **Step 1: Write the failing cleanup tests**

Create `src/adapters/osu/writer/remove-osu-template-artifacts.test.ts`:

```ts
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { removeOsuTemplateArtifacts } from "./remove-osu-template-artifacts.ts"

test("removes internal template artifacts and preserves generated assets", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-cleanup-"))
  const artifacts = ["receptor-base.png", "LNB.png", "LNT.png"]
  try {
    await mkdir(path.join(workspace, "mania", "lns"), { recursive: true })
    await Promise.all(
      artifacts.map((filename) => writeFile(path.join(workspace, filename), filename)),
    )
    await writeFile(path.join(workspace, "skin.ini"), "skin")
    await writeFile(path.join(workspace, "mania", "lns", "body.png"), "body")

    await removeOsuTemplateArtifacts(workspace)

    for (const filename of artifacts) {
      await assert.rejects(() => readFile(path.join(workspace, filename)), { code: "ENOENT" })
    }
    assert.equal(await readFile(path.join(workspace, "skin.ini"), "utf8"), "skin")
    assert.equal(await readFile(path.join(workspace, "mania", "lns", "body.png"), "utf8"), "body")
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test("rejects when an expected internal artifact cannot be removed", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-cleanup-"))
  try {
    await assert.rejects(() => removeOsuTemplateArtifacts(workspace), { code: "ENOENT" })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test src/adapters/osu/writer/remove-osu-template-artifacts.test.ts
```

Expected: FAIL because `remove-osu-template-artifacts.ts` does not exist.

- [ ] **Step 3: Implement allowlisted cleanup**

Create `src/adapters/osu/writer/remove-osu-template-artifacts.ts`:

```ts
import { rm } from "node:fs/promises"
import path from "node:path"

const internalOsuTemplateArtifacts = [
  "receptor-base.png",
  "LNB.png",
  "LNT.png",
] as const

export async function removeOsuTemplateArtifacts(outputDirectory: string): Promise<void> {
  await Promise.all(
    internalOsuTemplateArtifacts.map((filename) =>
      rm(path.join(outputDirectory, filename)),
    ),
  )
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test src/adapters/osu/writer/remove-osu-template-artifacts.test.ts
```

Expected: 2 tests pass.

### Task 3: Integrate Publication and Final Cleanup

**Files:**

- Modify: `src/adapters/osu/writer/osu-skin-writer.test.ts`
- Modify: `src/adapters/osu/writer/osu-skin-writer.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `readme.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- Consumes: `writeOsuLongNotes({ outputDirectory }): Promise<void>` and `removeOsuTemplateArtifacts(outputDirectory): Promise<void>`.
- Produces: a complete osu! workspace containing final LN assets and no internal root artifacts.

- [ ] **Step 1: Extend the successful writer test**

In `src/adapters/osu/writer/osu-skin-writer.test.ts`, define distinct fixture bytes:

```ts
const longNoteBody = Buffer.from([1, 2, 3])
const longNoteTail = Buffer.from([4, 5])
```

Write them into the fixture template directory as `LNB.png` and `LNT.png`. After
`writeSkin`, assert:

```ts
assert.deepEqual(
  await readFile(path.join(workspace, "mania", "lns", "body.png")),
  longNoteBody,
)
assert.deepEqual(
  await readFile(path.join(workspace, "mania", "lns", "tail.png")),
  longNoteTail,
)
for (const filename of ["receptor-base.png", "LNB.png", "LNT.png"]) {
  await assert.rejects(() => readFile(path.join(workspace, filename)), {
    code: "ENOENT",
  })
}
```

- [ ] **Step 2: Add a failed long-note build test**

Add a writer test whose template fixture includes `receptor-base.png` and `LNB.png` but
omits `LNT.png`. Supply a complete osu! model and assert:

```ts
await assert.rejects(() => new OsuSkinWriter(templates).writeSkin(skin, workspace), {
  code: "ENOENT",
})
await assert.doesNotReject(() =>
  readFile(path.join(workspace, "receptor-base.png")),
)
```

This proves cleanup did not start after the LN publication failure. Reuse a small helper
inside the test file to construct the complete `SkinModel`; do not export test fixtures to
production code.

- [ ] **Step 3: Run the writer test and verify RED**

Run:

```powershell
node --test src/adapters/osu/writer/osu-skin-writer.test.ts
```

Expected: the success test fails because LN files are absent, and the missing-tail test does
not yet reject.

- [ ] **Step 4: Coordinate LN publication and cleanup**

In `src/adapters/osu/writer/osu-skin-writer.ts`, add:

```ts
import { removeOsuTemplateArtifacts } from "./remove-osu-template-artifacts.ts"
import { writeOsuLongNotes } from "./write-osu-long-notes.ts"
```

Extend the existing build task group:

```ts
await Promise.all([
  writeOsuReceptors({
    receptors,
    outputDirectory: workspace,
    hitPosition: skin.playfield.hitPosition,
    columnWidth: skin.playfield.columnWidth,
    baseImagePath,
  }),
  writeOsuNotes({
    notes: tapNotes,
    outputDirectory: workspace,
  }),
  writeOsuLongNotes({ outputDirectory: workspace }),
])
await removeOsuTemplateArtifacts(workspace)
```

- [ ] **Step 5: Run the writer test and verify GREEN**

Run:

```powershell
node --test src/adapters/osu/writer/osu-skin-writer.test.ts
```

Expected: all writer tests pass, including final files, cleanup, and failed-build ordering.

- [ ] **Step 6: Extend the integration fixture and assertions**

In `tests/integration/etterna-to-osu.test.ts`, add:

```ts
const longNoteBody = Buffer.from([10, 20, 30, 40])
const longNoteTail = Buffer.from([50, 60, 70])
```

Write these buffers to `LNB.png` and `LNT.png` in `templatesDirectory`. After conversion,
assert:

```ts
assert.deepEqual(
  await readFile(path.join(outputDirectory, "mania", "lns", "body.png")),
  longNoteBody,
)
assert.deepEqual(
  await readFile(path.join(outputDirectory, "mania", "lns", "tail.png")),
  longNoteTail,
)
for (const filename of ["receptor-base.png", "LNB.png", "LNT.png"]) {
  await assert.rejects(() => readFile(path.join(outputDirectory, filename)), {
    code: "ENOENT",
  })
}
```

- [ ] **Step 7: Run the integration test**

Run:

```powershell
node --test tests/integration/etterna-to-osu.test.ts
```

Expected: PASS with byte-identical final LN files, no root artifacts, and the existing
receptor and tap-note assertions unchanged.

- [ ] **Step 8: Document the behavior**

Add to `readme.md`:

```markdown
The osu! template supplies fixed long-note assets. `LNB.png` is copied byte-for-byte to
`mania/lns/body.png`, and `LNT.png` is copied byte-for-byte to `mania/lns/tail.png`.
Internal build assets are removed from the generated skin after all output tasks succeed.
```

Add to the osu! writer section of `docs/architecture.md`:

```markdown
Fixed osu! long-note assets are published by a target writer without entering the image
pipeline. After every target asset succeeds, an allowlisted finalizer removes only known
internal template artifacts from the staged workspace.
```

- [ ] **Step 9: Format and run complete verification**

Run:

```powershell
npx @biomejs/biome check --write src tests
npm run lint
npm test
npm run typecheck
npm run test:architecture
git diff --check
git status --short
```

Expected:

- Biome reports no errors or warnings.
- All tests pass.
- TypeScript reports no errors.
- Architecture boundaries contain no violations or cycles.
- Git reports no whitespace errors.
- `receptor-base.png`, `LNB.png`, and `LNT.png` remain in `src/templates` as source assets.
- The intended working tree remains unstaged and uncommitted.
