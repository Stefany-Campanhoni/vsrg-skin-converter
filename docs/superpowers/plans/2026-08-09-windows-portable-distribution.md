# Windows Portable Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a verified Windows x64 portable ZIP that runs the existing CLI without an installed Node.js or npm.

**Architecture:** Bundle the ESM application with esbuild while leaving Sharp external, then assemble it with pinned Node.js 22.23.2, Windows x64 Sharp runtime files, and external templates. Resolve runtime resources from `import.meta.url`, never the current working directory, and verify both the unpacked package and an independently extracted ZIP.

**Tech Stack:** TypeScript 7, Node.js 22.23.2, esbuild, Sharp, PowerShell archive commands, Node test runner.

## Global Constraints

- The supported deliverable is Windows x64 only.
- Existing Etterna-to-osu! and osu!-to-Etterna behavior must remain unchanged.
- `sharp` remains external to the application bundle.
- Templates remain external files and are copied without content transformation.
- Runtime resource lookup must not depend on `process.cwd()`.
- Node runtime archive: `node-v22.23.2-win-x64.zip`.
- Node runtime archive SHA-256: `1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97`.
- Release output, caches, and staging directories must remain untracked.
- Do not add an installer, auto-update, signing, publishing, ARM64, Linux, or macOS support.
- Every behavior change follows red-green-refactor and every task ends with a focused commit.

---

## Planned File Structure

- Create `src/application-root.ts`: derive the application resource root from a module URL.
- Modify `src/config/paths.ts`: build game template paths from the application root.
- Modify `src/config/paths.test.ts`: prove current-working-directory independence.
- Create `src/cli/run-cli-command.ts`: dispatch help, version, interactive mode, and invalid arguments.
- Create `src/cli/run-cli-command.test.ts`: test the non-interactive CLI contract.
- Modify `src/cli.ts`: pass process arguments and package version into the command dispatcher.
- Modify `tsconfig.json`: allow the package JSON import and include release scripts.
- Create `scripts/release/release-config.ts`: own pinned runtime metadata and controlled paths.
- Create `scripts/release/build-application.ts`: produce `app.mjs` with Sharp external.
- Create `scripts/release/runtime-package/package.json`: declare only Sharp as a runtime package.
- Create `scripts/release/runtime-package/package-lock.json`: lock the Windows runtime dependency tree.
- Create `scripts/release/acquire-node-runtime.ts`: download, hash, and extract the pinned runtime.
- Create `scripts/release/install-runtime-dependencies.ts`: create a clean Windows x64 Sharp tree.
- Create `scripts/release/assemble-windows-portable.ts`: assemble the unpacked package.
- Create `scripts/release/create-windows-release.ts`: verify, archive, checksum, and safely publish.
- Create `scripts/release/verify-windows-portable.ts`: validate manifest and run smoke checks.
- Create `distribution/vsrg-skin-converter.cmd`: portable launcher.
- Create `distribution/README.txt`: end-user instructions.
- Create `distribution/THIRD-PARTY-NOTICES.txt`: redistribution notices.
- Create `LICENSE`: MIT license text for the project.
- Create `tests/distribution/release-config.test.ts`: validate names, paths, and pinned metadata.
- Create `tests/distribution/assemble-windows-portable.test.ts`: validate exact assembly behavior.
- Create `tests/distribution/verify-windows-portable.test.ts`: validate manifest and failure behavior.
- Create `tests/distribution/windows-portable-smoke.test.ts`: exercise the real unpacked artifact.
- Modify `package.json` and `package-lock.json`: add esbuild and release commands.
- Modify `.gitignore`: ignore only controlled build, cache, and release artifacts.
- Modify `readme.md`, `docs/architecture.md`, `docs/development-standards.md`, and
  `docs/agent-prompt-guidelines.md`: document distribution ownership and commands.

---

### Task 1: Module-relative application resources

**Files:**
- Create: `src/application-root.ts`
- Modify: `src/config/paths.ts`
- Modify: `src/config/paths.test.ts`

**Interfaces:**
- Produces: `resolveApplicationRoot(moduleUrl: string): string`
- Produces: `applicationRoot: string`
- Preserves: `osuTemplatesPath`, `etternaTemplatesPath`, and `resolveOsuSkinOutputPath(...)`

- [ ] **Step 1: Write the failing resource-root tests**

Add literal expectations that do not reuse the implementation logic:

```ts
test("resolves resources from the application module instead of the working directory", () => {
  assert.equal(
    resolveApplicationRoot("file:///C:/Portable%20App/app.mjs"),
    path.normalize("C:/Portable App"),
  )
})

test("keeps both template roots stable after changing the working directory", () => {
  const expectedSourceRoot = fileURLToPath(new URL("../", import.meta.url))
  const original = process.cwd()
  process.chdir(os.tmpdir())
  try {
    assert.equal(osuTemplatesPath, path.join(expectedSourceRoot, "templates", "osu"))
    assert.equal(etternaTemplatesPath, path.join(expectedSourceRoot, "templates", "etterna"))
  } finally {
    process.chdir(original)
  }
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test src/config/paths.test.ts`

Expected: FAIL because `resolveApplicationRoot` does not exist and the current exports still
follow `process.cwd()`.

- [ ] **Step 3: Implement the module-relative root**

Create the root module directly below `src` so source and bundled layouts share one invariant:

```ts
import path from "node:path"
import { fileURLToPath } from "node:url"

export function resolveApplicationRoot(moduleUrl: string): string {
  return path.dirname(fileURLToPath(moduleUrl))
}

export const applicationRoot = resolveApplicationRoot(import.meta.url)
```

Change template configuration to:

```ts
export const osuTemplatesPath = path.join(applicationRoot, "templates", "osu")
export const etternaTemplatesPath = path.join(applicationRoot, "templates", "etterna")
```

- [ ] **Step 4: Run focused and route composition tests**

Run: `node --test src/config/paths.test.ts src/cli/routes/*.test.ts`

Expected: PASS. The source layout still resolves `src/templates`, and changing CWD has no
effect.

- [ ] **Step 5: Commit the resource-root change**

```powershell
git add src/application-root.ts src/config/paths.ts src/config/paths.test.ts
git commit -m "refactor: resolve templates from application root"
```

---

### Task 2: Non-interactive CLI metadata commands

**Files:**
- Create: `src/cli/run-cli-command.ts`
- Create: `src/cli/run-cli-command.test.ts`
- Modify: `src/cli.ts`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: existing `runCli(): Promise<void>` interactive function.
- Produces: `runCliCommand(args: readonly string[], dependencies: CliCommandDependencies): Promise<void>`
- Produces: `CliCommandDependencies` with `version`, `writeLine`, and `runInteractiveCli`.

- [ ] **Step 1: Write failing command-dispatch tests**

Cover exactly four contracts:

```ts
function commandFixture() {
  const events: string[] = []
  const dependencies: CliCommandDependencies = {
    version: "1.0.0",
    writeLine: (value) => events.push(`write:${value}`),
    runInteractiveCli: async () => events.push("interactive"),
  }
  return { events, dependencies }
}

test("runs the interactive CLI when no arguments are supplied", async () => {
  const { events, dependencies } = commandFixture()
  await runCliCommand([], dependencies)
  assert.deepEqual(events, ["interactive"])
})

test("prints version without starting prompts", async () => {
  const { events, dependencies } = commandFixture()
  await runCliCommand(["--version"], dependencies)
  assert.deepEqual(events, ["write:1.0.0"])
})

test("prints concise help without starting prompts", async () => {
  const { events, dependencies } = commandFixture()
  await runCliCommand(["--help"], dependencies)
  assert.deepEqual(events, [
    "write:VSRG Skin Converter 1.0.0",
    "write:Usage: vsrg-skin-converter.cmd [--help|--version]",
  ])
})

test("rejects unknown or combined arguments", async () => {
  const { dependencies } = commandFixture()
  await assert.rejects(() => runCliCommand(["--unknown"], dependencies), /unknown argument/i)
  await assert.rejects(() => runCliCommand(["--help", "extra"], dependencies), /arguments/i)
})
```

- [ ] **Step 2: Run the command tests and confirm RED**

Run: `node --test src/cli/run-cli-command.test.ts`

Expected: FAIL because the command dispatcher does not exist.

- [ ] **Step 3: Implement minimal command dispatch**

Use this public shape:

```ts
export interface CliCommandDependencies {
  readonly version: string
  writeLine(value: string): void
  runInteractiveCli(): Promise<void>
}

export async function runCliCommand(
  args: readonly string[],
  dependencies: CliCommandDependencies,
): Promise<void> {
  if (args.length === 0) return dependencies.runInteractiveCli()
  if (args.length !== 1) throw new Error("Expected zero or one CLI argument")
  if (args[0] === "--version") return dependencies.writeLine(dependencies.version)
  if (args[0] === "--help") {
    dependencies.writeLine(`VSRG Skin Converter ${dependencies.version}`)
    dependencies.writeLine("Usage: vsrg-skin-converter.cmd [--help|--version]")
    return
  }
  throw new Error(`Unknown argument: ${args[0]}`)
}
```

Import `package.json` in `src/cli.ts` with an ESM JSON import attribute, enable
`resolveJsonModule`, and call the dispatcher with `process.argv.slice(2)`, `console.log`, and
the existing interactive `runCli`.

- [ ] **Step 4: Run CLI and type checks**

Run:

```powershell
node --test src/cli/main.test.ts src/cli/run-cli-command.test.ts
node src/cli.ts --version
node src/cli.ts --help
npm run typecheck
```

Expected: tests PASS; both commands exit zero without rendering prompts; typecheck PASS.

- [ ] **Step 5: Commit the command surface**

```powershell
git add src/cli.ts src/cli/run-cli-command.ts src/cli/run-cli-command.test.ts tsconfig.json
git commit -m "feat: add non-interactive CLI metadata commands"
```

---

### Task 3: Deterministic application bundle

**Files:**
- Create: `scripts/release/release-config.ts`
- Create: `scripts/release/build-application.ts`
- Create: `tests/distribution/release-config.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `nodeRuntime` exact metadata object.
- Produces: `getReleasePaths(projectRoot: string, version: string): ReleasePaths`.
- Produces: `buildApplication(options: BuildApplicationOptions): Promise<void>`.

- [ ] **Step 1: Write failing release configuration tests**

Assert hand-derived values for version `1.0.0` and root `C:/repo`:

```ts
assert.deepEqual(nodeRuntime, {
  version: "22.23.2",
  archiveName: "node-v22.23.2-win-x64.zip",
  sha256: "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97",
  url: "https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip",
})
assert.equal(paths.packageDirectoryName, "vsrg-skin-converter-v1.0.0-win-x64")
assert.equal(paths.bundlePath, path.join("C:/repo", "build", "app.mjs"))
```

Also assert that every destructive build path is a strict descendant of the project root and
that release artifacts are outside staging.

- [ ] **Step 2: Run the config test and confirm RED**

Run: `node --test tests/distribution/release-config.test.ts`

Expected: FAIL because release configuration does not exist.

- [ ] **Step 3: Add esbuild and implement configuration**

Install an exact esbuild dev dependency and add `scripts/**/*` to TypeScript and Biome command
coverage. Add these ignored roots:

```gitignore
.cache/release/
build/
release/
```

`getReleasePaths` must call `path.resolve(projectRoot)` and reject a filesystem root, relative
root, empty version, or any derived path not strictly contained by the root.

- [ ] **Step 4: Write the failing bundle smoke test**

Add a test that builds into a temporary directory, asserts `app.mjs` exists, checks that the
bundle still contains an external `sharp` import, and runs it with `--version` from a different
CWD. The expected stdout is exactly `1.0.0` plus the platform newline.

- [ ] **Step 5: Run the smoke test and confirm RED**

Run: `node --test tests/distribution/release-config.test.ts`

Expected: FAIL because `buildApplication` does not exist.

- [ ] **Step 6: Implement the application bundle**

Use esbuild's API with this behavioral configuration:

```ts
await build({
  entryPoints: [options.entryPoint],
  outfile: options.outputFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["sharp"],
  sourcemap: false,
  legalComments: "none",
})
```

Wrap esbuild failures with entry and output paths. Add `npm run build` to invoke the script.

- [ ] **Step 7: Run bundle, lint, and type checks**

Run:

```powershell
node --test tests/distribution/release-config.test.ts
npm run build
npm run typecheck
npm run lint
```

Expected: PASS and `build/app.mjs` exists without bundled Sharp native code.

- [ ] **Step 8: Commit the deterministic bundle**

```powershell
git add .gitignore package.json package-lock.json tsconfig.json scripts/release tests/distribution/release-config.test.ts
git commit -m "build: add deterministic application bundle"
```

---

### Task 4: Pinned Node and Sharp runtime acquisition

**Files:**
- Create: `scripts/release/acquire-node-runtime.ts`
- Create: `scripts/release/install-runtime-dependencies.ts`
- Create: `scripts/release/runtime-package/package.json`
- Create: `scripts/release/runtime-package/package-lock.json`
- Create: `tests/distribution/runtime-acquisition.test.ts`

**Interfaces:**
- Consumes: `nodeRuntime` from release configuration.
- Produces: `acquireNodeRuntime(options: AcquireNodeRuntimeOptions): Promise<string>` returning an absolute `node.exe` path.
- Produces: `installRuntimeDependencies(options: InstallRuntimeDependenciesOptions): Promise<string>` returning an absolute `node_modules` path.

- [ ] **Step 1: Write failing checksum and cache tests**

Inject download, extraction, hashing, and filesystem dependencies. Cover:

```ts
test("downloads once, verifies the pinned hash, and returns node.exe", async () => {})
test("reuses a cached archive only after verifying its hash", async () => {})
test("rejects a mismatched archive without extracting it", async () => {})
test("rejects an extracted runtime without the regular node.exe file", async () => {})
```

Assertions must use the exact configured URL, SHA-256, archive path, extraction destination,
and causal error object.

- [ ] **Step 2: Run runtime acquisition tests and confirm RED**

Run: `node --test tests/distribution/runtime-acquisition.test.ts`

Expected: FAIL because acquisition functions do not exist.

- [ ] **Step 3: Implement pinned runtime acquisition**

Stream the official archive to a temporary sibling, compute SHA-256 before rename, and use
PowerShell `Expand-Archive -LiteralPath ... -DestinationPath ...`. Validate every resolved
cache and extraction path before removal. Never accept a hash mismatch or reuse an unverified
extraction.

- [ ] **Step 4: Write failing Sharp installation tests**

Inject the command runner and assert this exact contract:

```ts
assert.deepEqual(command, {
  executable: process.platform === "win32" ? "npm.cmd" : "npm",
  args: ["ci", "--omit=dev", "--os=win32", "--cpu=x64"],
  cwd: runtimePackageDirectory,
})
```

Test that the operation rejects missing `node_modules/sharp`, missing `node_modules/@img`, and
a command failure with the exact cause.

- [ ] **Step 5: Implement the isolated runtime dependency tree**

The runtime package contains only:

```json
{
  "name": "vsrg-skin-converter-windows-runtime",
  "private": true,
  "version": "1.0.0",
  "dependencies": { "sharp": "0.35.3" }
}
```

Generate and commit its lockfile. Install into a clean copied runtime-package directory, then
return its validated `node_modules`. Do not prune or mutate the repository's dependencies.

- [ ] **Step 6: Run acquisition tests and one real acquisition**

Run:

```powershell
node --test tests/distribution/runtime-acquisition.test.ts
node scripts/release/acquire-node-runtime.ts
node scripts/release/install-runtime-dependencies.ts
```

Expected: tests PASS; the downloaded archive hash matches the pinned value; the resulting
tree loads Sharp on Windows x64.

- [ ] **Step 7: Commit runtime acquisition**

```powershell
git add scripts/release tests/distribution/runtime-acquisition.test.ts
git commit -m "build: acquire pinned Windows runtime dependencies"
```

---

### Task 5: Portable package assembly

**Files:**
- Create: `scripts/release/assemble-windows-portable.ts`
- Create: `tests/distribution/assemble-windows-portable.test.ts`
- Create: `distribution/vsrg-skin-converter.cmd`
- Create: `distribution/README.txt`
- Create: `distribution/THIRD-PARTY-NOTICES.txt`
- Create: `LICENSE`
- Modify: `package.json`

**Interfaces:**
- Consumes: bundle, Node runtime, runtime dependencies, source templates, static distribution files.
- Produces: `assembleWindowsPortable(options: AssembleWindowsPortableOptions): Promise<PortablePackage>`.
- `PortablePackage` contains absolute `root`, `launcher`, `bundle`, and `nodeExecutable` paths.

- [ ] **Step 1: Write the failing exact-assembly test**

Build controlled fixtures and assert the package contains exactly:

```text
vsrg-skin-converter.cmd
app.mjs
runtime/node.exe
node_modules/sharp/**
node_modules/@img/**
templates/osu/**
templates/etterna/**
README.txt
LICENSE
THIRD-PARTY-NOTICES.txt
```

Assert source templates remain byte-identical, the previous completed package survives a
builder failure, and staging is removed after success and failure.

- [ ] **Step 2: Run assembly tests and confirm RED**

Run: `node --test tests/distribution/assemble-windows-portable.test.ts`

Expected: FAIL because the assembler does not exist.

- [ ] **Step 3: Create static distribution files**

The launcher must use quoted `%~dp0` paths, forward `%*`, retain `%ERRORLEVEL%`, and print a
failure footer before returning the same non-zero code. The packaged README describes only
extract-and-run usage. The project LICENSE contains the standard MIT text with author `tefyy`
and year `2026`. Notices identify Node.js, Sharp, and packaged libvips/@img licensing and
upstream URLs without claiming the converter authorship of those components.

- [ ] **Step 4: Implement staged package assembly**

Use `cp(..., { recursive: true, errorOnExist: true })` into a uniquely named staging sibling.
Validate every source as a regular file or directory before copying. Promote staging to the
final unpacked directory only after all tasks settle successfully. Reuse the repository's
transactional filesystem principles; do not overwrite an earlier verified directory before
the replacement is complete.

- [ ] **Step 5: Run assembly and existing integration tests**

Run:

```powershell
node --test tests/distribution/assemble-windows-portable.test.ts
node --test tests/integration/*.test.ts
```

Expected: PASS with byte-identical templates and unchanged conversion behavior.

- [ ] **Step 6: Commit package assembly**

```powershell
git add LICENSE distribution scripts/release/assemble-windows-portable.ts tests/distribution/assemble-windows-portable.test.ts package.json
git commit -m "build: assemble Windows portable package"
```

---

### Task 6: Manifest, Sharp, launcher, and ZIP verification

**Files:**
- Create: `scripts/release/verify-windows-portable.ts`
- Create: `scripts/release/create-windows-release.ts`
- Create: `tests/distribution/verify-windows-portable.test.ts`
- Create: `tests/distribution/windows-portable-smoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `verifyWindowsPortable(options: VerifyWindowsPortableOptions): Promise<void>`.
- Produces: `createWindowsRelease(options: CreateWindowsReleaseOptions): Promise<ReleaseArtifact>`.
- `ReleaseArtifact` contains absolute `zipPath`, `checksumPath`, and lowercase `sha256`.

- [ ] **Step 1: Write failing manifest validation tests**

Test missing required entries, unexpected `.ts`, `.test.*`, source map, cache, or nested
`node.exe` entries, a template byte mismatch, and symlinks. Each failure must name the exact
entry and package root.

- [ ] **Step 2: Run verification tests and confirm RED**

Run: `node --test tests/distribution/verify-windows-portable.test.ts`

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement structural verification**

Enumerate with `readdir(..., { recursive: true, withFileTypes: true })`, normalize relative
paths to `/`, reject symlinks and forbidden suffixes, and compare every copied template's
SHA-256 with its source counterpart. Require exactly one launcher, bundle, and runtime
`node.exe`, plus non-empty Sharp and @img trees.

- [ ] **Step 4: Write the failing real smoke test**

Assemble under a temporary path containing `Portable Build With Spaces`, choose a different
CWD, then assert:

```ts
assert.equal(await runLauncher(["--version"]), "1.0.0\r\n")
assert.match(await runLauncher(["--help"]), /Usage: vsrg-skin-converter\.cmd/)
```

Use packaged `runtime/node.exe` for a real Sharp operation that creates a 2x2 transparent PNG,
resizes it to 1x1, and verifies the output metadata. Read one required file from each packaged
template root. The test must not resolve modules or templates from the repository.

- [ ] **Step 5: Implement runtime smoke verification**

Run the launcher with argument arrays through `spawn`, never a shell-built command string.
Run the Sharp probe with `runtime/node.exe --input-type=module --eval <literal probe>` and CWD
set to the package root. Capture stdout, stderr, exit code, and timeout; include all four in a
contextual failure.

- [ ] **Step 6: Write failing ZIP publication tests**

Inject compression, extraction, and hashing. Assert the versioned top-level directory,
`vsrg-skin-converter-v1.0.0-win-x64.zip`, adjacent `.sha256`, lowercase 64-character digest,
checksum file format, independent extraction, and preservation of the previous ZIP when any
verification phase fails.

- [ ] **Step 7: Implement ZIP creation and post-extraction verification**

Use PowerShell `Compress-Archive` and `Expand-Archive` with literal paths. Write ZIP and
checksum to temporary siblings, verify the checksum, extract into a fresh temporary directory,
run the full verifier there, and only then rename both artifacts into `release`. Remove only
validated, task-owned temporary paths.

- [ ] **Step 8: Run distribution tests**

Run:

```powershell
node --test tests/distribution/*.test.ts
npm run build:windows
npm run test:distribution
```

Expected: PASS; unpacked package, ZIP, and checksum exist under ignored controlled roots.

- [ ] **Step 9: Commit release verification**

```powershell
git add scripts/release tests/distribution package.json package-lock.json
git commit -m "build: verify and archive Windows portable release"
```

---

### Task 7: Documentation and release gate

**Files:**
- Modify: `readme.md`
- Modify: `docs/architecture.md`
- Modify: `docs/development-standards.md`
- Modify: `docs/agent-prompt-guidelines.md`

**Interfaces:**
- Documents the supported commands and ownership boundaries; produces no runtime API.

- [ ] **Step 1: Update end-user and developer documentation**

Document the ZIP layout, Windows x64 support, extract-and-run flow, `--help`, `--version`,
build commands, pinned Node update procedure, Sharp externalization, template-root invariant,
license notices, and the explicit non-goals from the specification. State that SEA remains an
unmerged experiment.

- [ ] **Step 2: Run every quality gate from a clean build root**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run release:windows
git diff --check
```

Expected: all commands exit zero; the test summary has zero failures; the release command
produces one versioned ZIP and matching checksum.

- [ ] **Step 3: Manually inspect release boundaries**

Confirm `git status --short` contains only intended source and documentation changes, neither
`build` nor `release` is tracked, the ZIP contains no TypeScript/tests/caches, and launching
the extracted archive from Explorer preserves visible failure output and exit codes.

- [ ] **Step 4: Commit documentation**

```powershell
git add readme.md docs/architecture.md docs/development-standards.md docs/agent-prompt-guidelines.md
git commit -m "docs: document Windows portable releases"
```

- [ ] **Step 5: Request final code review without committing generated artifacts**

Review the full change range against `docs/architecture.md`,
`docs/development-standards.md`, and the documented behavior contract. Fix every critical or
important finding, repeat Step 2, and leave the verified source branch ready for user review.
