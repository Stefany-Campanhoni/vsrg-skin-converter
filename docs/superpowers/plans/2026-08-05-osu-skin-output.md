# osu! Skin Output Implementation Plan

> Historical note: installation-folder recovery subsequently changed
> `resolveOsuSkinOutputPath` to consume an already resolved osu! installation root. The CLI
> now derives the `%LOCALAPPDATA%/osu!` default centrally and may replace it with an absolute
> directory selected by the user. The snippets below record the original implementation
> sequence rather than the current interface.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish converted skins to `%LOCALAPPDATA%/osu!/Skins/<skin name>`.

**Architecture:** A config-level resolver consumes an injected `LOCALAPPDATA` root,
validates it and the output skin name, then joins the osu! Skins directory with that safe
segment. The CLI supplies `process.env.LOCALAPPDATA` and passes the exact target to the
existing transactional publisher.

**Tech Stack:** TypeScript, Node path/environment APIs, node:test.

## Global Constraints

- Do not enumerate or modify other osu! skins.
- Preserve `TransactionalOutputPublisher` replacement behavior.
- Throw if `LOCALAPPDATA` is unavailable.
- Require an absolute `LOCALAPPDATA` root and one safe output directory segment.
- Do not commit changes.

---

### Task 1: Resolve the osu! skin destination

**Files:**
- Modify: `src/config/paths.ts`
- Create: `src/config/paths.test.ts`

**Interfaces:** Produces
`resolveOsuSkinOutputPath(skinName: string, localAppData: string | undefined): string`.

- [ ] **Step 1: Write failing tests**

```ts
assert.equal(
  resolveOsuSkinOutputPath("My Skin", "C:/Users/Alice/AppData/Local"),
  path.join("C:/Users/Alice/AppData/Local", "osu!", "Skins", "My Skin"),
)
assert.throws(() => resolveOsuSkinOutputPath("My Skin", undefined), /LOCALAPPDATA/i)
assert.throws(
  () => resolveOsuSkinOutputPath("../Other Skin", "C:/Users/Alice/AppData/Local"),
  /unsafe/i,
)
assert.throws(() => resolveOsuSkinOutputPath("My Skin", "relative/root"), /absolute/i)
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/config/paths.test.ts`

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement the resolver**

```ts
export function resolveOsuSkinOutputPath(
  skinName: string,
  localAppData: string | undefined,
): string {
  if (!localAppData?.trim()) throw new Error("LOCALAPPDATA is required to locate osu! skins")
  if (!path.isAbsolute(localAppData)) throw new Error("Expected an absolute LOCALAPPDATA path")
  assertSafeSkinName(skinName)
  return path.join(localAppData, "osu!", "Skins", skinName)
}

function assertSafeSkinName(skinName: string): void {
  if (
    skinName.trim().length === 0 ||
    skinName === "." ||
    skinName === ".." ||
    path.isAbsolute(skinName) ||
    /[\\/\0]/.test(skinName)
  ) {
    throw new Error(`Unsafe osu! skin name: ${JSON.stringify(skinName)}`)
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run: `node --test src/config/paths.test.ts`

Expected: PASS.

### Task 2: Supply the selected skin destination from the CLI

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `docs/architecture.md`

**Interfaces:** Consumes
`resolveOsuSkinOutputPath(reference.name, process.env.LOCALAPPDATA)` and passes its value as
`ConvertSkinRequest.outputDirectory`.

- [ ] **Step 1: Write the failing destination-resolution test**

```ts
assert.equal(resolveOsuSkinOutputPath(reference.name, localAppData), expectedSkinDirectory)
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/config/paths.test.ts`

Expected: FAIL until the resolver has the required semantics.

- [ ] **Step 3: Replace the fixed output path**

```ts
outputDirectory: resolveOsuSkinOutputPath(reference.name, process.env.LOCALAPPDATA),
```

Remove `outputPath` from CLI imports and document that the CLI publishes the selected skin into the osu! Skins directory.

- [ ] **Step 4: Verify full suite**

Run: `npm test; npm run typecheck; npm run lint; npm run test:architecture; git diff --check`

Expected: every command exits successfully.
