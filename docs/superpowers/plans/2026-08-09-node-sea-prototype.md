# Node SEA Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether the complete Windows x64 converter can be delivered as one Node SEA executable by producing a reproducible prototype or a demonstrated technical blocker.

**Architecture:** Build the CLI as CommonJS with Sharp external, embed the application, Sharp runtime tree, and templates as SEA assets, and extract them into a content-addressed user cache before loading the application. Perform all work on an isolated branch and return a prototype, smoke evidence, and comparison report without merging it into the maintained branch.

**Tech Stack:** TypeScript 7, Node.js 22.23.2 SEA, esbuild, postject, Sharp, Node test runner.

## Global Constraints

- Execute only in the dedicated SEA Git worktree and branch created from design commit `008dc92`.
- Do not edit, merge into, or clean the primary worktree.
- Windows x64 is the only target.
- Node binary: `node-v22.23.2-win-x64.zip` with SHA-256 `1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97`.
- The user must receive one executable; first-run extraction to a versioned cache is allowed.
- The destination must not require installed Node.js, npm, repository files, or network access.
- Existing conversion behavior must remain unchanged.
- The output is experimental and must not modify supported-distribution documentation as if SEA were released.
- If blocked, preserve the smallest reproducible failure, test evidence, and exact tool/runtime versions.
- Every prototype behavior follows red-green-refactor and each independently reviewable task is committed on the SEA branch.

---

## Planned File Structure

- Create `scripts/sea/sea-config.ts`: pinned SEA paths and metadata.
- Create `scripts/sea/build-sea-payload.ts`: bundle the actual CLI and stage runtime assets.
- Create `scripts/sea/generate-sea-assets.ts`: enumerate safe SEA asset keys.
- Create `scripts/sea/bootstrap.cjs`: extract assets atomically and load the real application.
- Create `scripts/sea/build-sea.ts`: generate blob, inject it into Node, and write the executable.
- Create `scripts/sea/verify-sea.ts`: run isolated smoke checks.
- Create `tests/sea/sea-config.test.ts`: validate fixed metadata and containment.
- Create `tests/sea/generate-sea-assets.test.ts`: validate deterministic safe asset maps.
- Create `tests/sea/bootstrap.test.ts`: validate cache extraction, reuse, and recovery.
- Create `tests/sea/sea-smoke.test.ts`: execute the final SEA artifact.
- Create `docs/experiments/2026-08-09-node-sea-prototype.md`: report evidence and comparison.
- Modify only in the SEA worktree: `package.json`, `package-lock.json`, `.gitignore`, and
  `tsconfig.json` for prototype tooling.

---

### Task 1: Isolated worktree and pinned SEA configuration

**Files:**
- Create: `scripts/sea/sea-config.ts`
- Create: `tests/sea/sea-config.test.ts`
- Modify: `.gitignore`
- Modify: `tsconfig.json`

**Interfaces:**
- Produces: `getSeaPaths(projectRoot: string, version: string): SeaPaths`.
- Produces: `seaNodeRuntime` exact metadata object.

- [ ] **Step 1: Verify worktree isolation before editing**

Run:

```powershell
git rev-parse --git-dir
git rev-parse --git-common-dir
git branch --show-current
git status --short
```

Expected: Git dir differs from common dir, branch is `codex/node-sea-prototype`, and status is
clean. Stop and report instead of editing if any condition fails.

- [ ] **Step 2: Write failing SEA configuration tests**

Assert the exact Node archive metadata, a release stem of
`vsrg-skin-converter-v1.0.0-win-x64-sea`, controlled `.cache/sea`, `build/sea`, and
`release/experimental` roots, and strict descendant containment for every destructive path.

- [ ] **Step 3: Run the test and confirm RED**

Run: `node --test tests/sea/sea-config.test.ts`

Expected: FAIL because SEA configuration does not exist.

- [ ] **Step 4: Implement SEA configuration and ignore owned artifacts**

Use this literal runtime object:

```ts
export const seaNodeRuntime = {
  version: "22.23.2",
  archiveName: "node-v22.23.2-win-x64.zip",
  sha256: "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97",
  url: "https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip",
} as const
```

Ignore only `.cache/sea/`, `build/sea/`, and `release/experimental/`. Include `scripts/**/*`
and `tests/**/*` in type checking.

- [ ] **Step 5: Run the focused test and commit**

Run: `node --test tests/sea/sea-config.test.ts`

Expected: PASS.

```powershell
git add .gitignore tsconfig.json scripts/sea/sea-config.ts tests/sea/sea-config.test.ts
git commit -m "build: add pinned SEA prototype configuration"
```

---

### Task 2: Actual CLI payload with external Sharp

**Files:**
- Create: `scripts/sea/build-sea-payload.ts`
- Create: `tests/sea/build-sea-payload.test.ts`
- Create: `scripts/sea/runtime-package/package.json`
- Create: `scripts/sea/runtime-package/package-lock.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `buildSeaPayload(options: BuildSeaPayloadOptions): Promise<SeaPayload>`.
- `SeaPayload` contains absolute `applicationFile`, `templateRoot`, and `nodeModulesRoot` paths.

- [ ] **Step 1: Write the failing payload test**

Use temporary output and assert:

- `application.cjs` is generated from the real `src/cli.ts`;
- the bundle retains `require("sharp")` instead of embedding native files;
- both template roots are copied byte-for-byte;
- only Sharp and @img production modules enter `node_modules`;
- no `.ts`, test, source-map, cache, or repository path enters the payload.

- [ ] **Step 2: Run the payload test and confirm RED**

Run: `node --test tests/sea/build-sea-payload.test.ts`

Expected: FAIL because the payload builder does not exist.

- [ ] **Step 3: Install exact prototype tooling**

Add exact dev dependencies for esbuild and postject. The isolated runtime package contains
only `sharp: 0.35.3`; generate and commit its lockfile. Do not reuse the repository's complete
`node_modules` as payload input.

- [ ] **Step 4: Implement the CommonJS payload**

Bundle with:

```ts
await build({
  entryPoints: [path.join(projectRoot, "src", "cli.ts")],
  outfile: applicationFile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["sharp"],
  sourcemap: false,
})
```

Install the runtime package through `npm ci --omit=dev --os=win32 --cpu=x64`, then copy its
`node_modules`, `src/templates`, and the bundle into a clean payload root.

- [ ] **Step 5: Run the payload tests and commit**

Run:

```powershell
node --test tests/sea/build-sea-payload.test.ts
npm run typecheck
```

Expected: PASS.

```powershell
git add package.json package-lock.json scripts/sea tests/sea/build-sea-payload.test.ts
git commit -m "build: create SEA application payload"
```

---

### Task 3: Safe deterministic asset map

**Files:**
- Create: `scripts/sea/generate-sea-assets.ts`
- Create: `tests/sea/generate-sea-assets.test.ts`

**Interfaces:**
- Produces: `generateSeaAssets(payloadRoot: string): Promise<Readonly<Record<string, string>>>`.
- Asset keys use normalized `/` separators and the prefix `payload/`.

- [ ] **Step 1: Write failing asset-map tests**

Create nested fixtures and assert an exact lexicographically sorted mapping. Reject symlinks,
empty payloads, keys containing `.` or `..` path segments, files outside the real payload root,
case-insensitive duplicate keys, and any source-map or TypeScript file.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/sea/generate-sea-assets.test.ts`

Expected: FAIL because asset enumeration does not exist.

- [ ] **Step 3: Implement safe enumeration**

Resolve the physical payload root, enumerate regular files only, verify every realpath remains
inside that root, normalize and sort relative names, and create:

```ts
assets[`payload/${relativePath.replaceAll(path.sep, "/")}`] = absoluteFilePath
```

Return a frozen plain object whose insertion order is deterministic.

- [ ] **Step 4: Run focused tests and commit**

Run: `node --test tests/sea/generate-sea-assets.test.ts`

Expected: PASS.

```powershell
git add scripts/sea/generate-sea-assets.ts tests/sea/generate-sea-assets.test.ts
git commit -m "build: generate safe SEA asset map"
```

---

### Task 4: Content-addressed SEA bootstrap extraction

**Files:**
- Create: `scripts/sea/bootstrap.cjs`
- Create: `tests/sea/bootstrap.test.ts`

**Interfaces:**
- SEA asset keys consumed: every `payload/**` key plus `payload-manifest.json`.
- Cache root: `%LOCALAPPDATA%/VSRGSkinConverter/sea-cache/<payload-sha256>` with an OS temp
  fallback only when `LOCALAPPDATA` is unavailable.
- Internal smoke argument: `--sea-smoke`; it is owned only by the prototype bootstrap.

- [ ] **Step 1: Write failing extraction behavior tests**

Execute the bootstrap logic with injected SEA, filesystem, and loader dependencies. Cover:

- first-run extraction writes every manifest entry and an atomic completion marker;
- a complete cache is reused without rewriting files;
- an incomplete cache is replaced rather than trusted;
- hash mismatch, traversal key, symlink/reparse escape, or missing asset aborts before loading;
- two concurrent processes converge without observing partial payload;
- application load occurs only after the complete marker is durable.

- [ ] **Step 2: Run bootstrap tests and confirm RED**

Run: `node --test tests/sea/bootstrap.test.ts`

Expected: FAIL because bootstrap extraction does not exist.

- [ ] **Step 3: Implement extraction and application loading**

The generated manifest records every key, byte length, SHA-256, and total payload hash. The
bootstrap validates keys before joining, writes into a unique staging sibling, hashes every
written file, renames staging atomically, and writes the completion marker last. Use
`createRequire(path.join(cacheRoot, "application.cjs"))` only after validation so external
Sharp resolves from the extracted `node_modules`.

For `--sea-smoke`, do not start prompts. Load extracted Sharp, resize a generated 2x2 PNG to
1x1, read one osu! and one Etterna template, print exactly `SEA smoke passed`, and exit zero.

- [ ] **Step 4: Run bootstrap tests and commit**

Run: `node --test tests/sea/bootstrap.test.ts`

Expected: PASS, including concurrent and corrupt-cache cases.

```powershell
git add scripts/sea/bootstrap.cjs tests/sea/bootstrap.test.ts
git commit -m "feat: extract SEA payload into verified cache"
```

---

### Task 5: Build the Windows SEA executable

**Files:**
- Create: `scripts/sea/build-sea.ts`
- Create: `tests/sea/build-sea.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: payload builder, asset map, bootstrap, pinned Node archive, and postject.
- Produces: `buildSea(options: BuildSeaOptions): Promise<string>` returning the absolute `.exe` path.

- [ ] **Step 1: Write failing orchestration tests**

Inject command and filesystem boundaries. Assert this ordered behavior:

1. build and validate payload;
2. generate manifest and assets;
3. write `sea-config.json` with bootstrap main and the complete asset map;
4. run pinned Node with `--experimental-sea-config`;
5. copy the pinned Windows `node.exe` to a temporary output;
6. remove the copied binary signature using the documented Windows signing tool when present;
7. inject `NODE_SEA_BLOB` with postject and the Node SEA sentinel fuse;
8. rename to the final experimental executable only after smoke verification.

Preserve the exact first command failure as the error cause and settle independent payload
preparation operations before rejecting.

- [ ] **Step 2: Run orchestration tests and confirm RED**

Run: `node --test tests/sea/build-sea.test.ts`

Expected: FAIL because SEA orchestration does not exist.

- [ ] **Step 3: Implement the Node 22 SEA pipeline**

Generate configuration with `useSnapshot: false` and `useCodeCache: false`. Invoke the local
postject binary through the current Node process rather than `npx`. Use documented resource
name `NODE_SEA_BLOB` and sentinel
`NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`. Validate that the final path is within
`release/experimental` before replacement.

- [ ] **Step 4: Run unit tests and create a real executable**

Run:

```powershell
node --test tests/sea/build-sea.test.ts
npm run build:sea
```

Expected: tests PASS and one executable exists under `release/experimental` without adjacent
runtime/template files.

- [ ] **Step 5: Commit SEA build orchestration**

```powershell
git add package.json package-lock.json scripts/sea/build-sea.ts tests/sea/build-sea.test.ts
git commit -m "build: produce experimental Node SEA executable"
```

---

### Task 6: Isolated executable smoke tests and evidence report

**Files:**
- Create: `scripts/sea/verify-sea.ts`
- Create: `tests/sea/sea-smoke.test.ts`
- Create: `docs/experiments/2026-08-09-node-sea-prototype.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `verifySea(executablePath: string): Promise<SeaVerificationResult>`.
- `SeaVerificationResult` records executable bytes, cold and warm startup milliseconds,
  extracted cache bytes, and cache path.

- [ ] **Step 1: Write the failing black-box smoke test**

Copy only the executable to a path containing spaces, set CWD to another empty directory and
`LOCALAPPDATA` to a controlled empty root, then run `--sea-smoke`. Assert exact stdout, zero
exit, no adjacent extracted files, verified cache creation, and a successful second warm run.
Run once with network disabled by replacing proxy variables with unreachable local endpoints.

- [ ] **Step 2: Run the smoke test and confirm RED**

Run: `node --test tests/sea/sea-smoke.test.ts`

Expected: FAIL until the real executable and verifier satisfy all black-box requirements.

- [ ] **Step 3: Implement the verifier**

Use `spawn` with argument arrays and a 30-second timeout. Record cold/warm durations around the
process, recursively total executable/cache file sizes, and reject non-zero exits with captured
stdout, stderr, exit code, timeout, executable, and CWD.

- [ ] **Step 4: Run complete prototype verification**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run build:sea
npm run test:sea
git diff --check
```

Expected for a viable prototype: all commands exit zero and smoke output is `SEA smoke passed`.
If SEA itself or native module loading blocks completion, retain the failing black-box test and
the smallest reproducible command/output instead of weakening acceptance criteria.

- [ ] **Step 5: Write the evidence and comparison report**

Record:

- branch, commit, Node, postject, esbuild, Sharp, Windows, and architecture versions;
- exact build and smoke commands;
- executable and extracted cache sizes;
- cold and warm startup timings from at least five runs, reporting median values;
- where and why extraction is required;
- whether Sharp, templates, both conversion routes, offline startup, spaces, and cache recovery work;
- security and maintenance implications;
- differences from the supported portable ZIP design;
- recommendation: reject, continue experimenting, or propose a separately reviewed integration.

Do not describe an unverified capability as working.

- [ ] **Step 6: Commit the prototype report and final evidence**

```powershell
git add package.json package-lock.json scripts/sea tests/sea docs/experiments/2026-08-09-node-sea-prototype.md
git commit -m "docs: report Node SEA prototype results"
```

- [ ] **Step 7: Hand off without merging**

Report the isolated worktree path, branch, final commit, verification summary, artifact path,
and report path to the primary agent. Leave the worktree intact for user inspection and do not
merge, cherry-pick, rebase, or delete it.
