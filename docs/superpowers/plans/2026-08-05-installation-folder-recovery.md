# Installation Folder Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prompt for missing Etterna or osu! installation folders through a native Windows folder picker and publish into the selected osu! installation.

**Architecture:** `src/cli/folder-picker.ts` provides a fixed PowerShell Windows Forms
dialog with contextual process errors. A dedicated, testable
`src/cli/installation-directory.ts` coordinator distinguishes directories, missing paths,
and unexpected filesystem failures while choosing the default or replacement root. Config
derives the optional default osu! installation, and the CLI passes the resolved roots to
readers and target-path resolution.

**Tech Stack:** Node.js 22, TypeScript, Node built-in test runner, `@clack/prompts`, PowerShell/.NET Windows Forms.

## Global Constraints

- Use the native folder dialog only after the user presses any key.
- A cancelled dialog ends the CLI normally with no user-facing message.
- The folder-dialog PowerShell command contains no user-controlled value.
- Missing paths trigger recovery; unexpected filesystem and process failures preserve `cause`.
- Never construct a relative osu! default when `LOCALAPPDATA` is unavailable.
- Remove the standalone prototype script, its test, and its npm task.
- Do not create commits; the user requested uncommitted changes on `main`.

---

### Task 1: Move the native picker into the CLI layer

**Files:**
- Create: `src/cli/folder-picker.ts`
- Create: `src/cli/folder-picker.test.ts`
- Delete: `src/scripts/folder-picker-prototype.ts`
- Delete: `src/scripts/folder-picker-prototype.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pickDirectory(): Promise<string | undefined>`.
- Produces: `parseSelectedDirectory(output: string): string | undefined`.
- Produces: `createDirectoryPicker(runDirectoryDialog): () => Promise<string | undefined>`.

- [ ] **Step 1: Write failing parser tests**

```ts
test("returns the selected directory", () => {
  assert.equal(parseSelectedDirectory(" C:\\Games\\Etterna \\r\\n"), "C:\\Games\\Etterna")
})

test("returns undefined when the dialog is cancelled", () => {
  assert.equal(parseSelectedDirectory("\\r\\n"), undefined)
})

test("preserves PowerShell failures with folder-picker context", async () => {
  const cause = new Error("powershell unavailable")
  const pickDirectory = createDirectoryPicker(async () => { throw cause })
  await assert.rejects(
    () => pickDirectory(),
    (error: unknown) => {
      assert(error instanceof Error)
      assert.match(error.message, /could not open the Windows folder picker/i)
      assert.equal(error.cause, cause)
      return true
    },
  )
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/cli/folder-picker.test.ts`

Expected: FAIL because the CLI picker module does not exist.

- [ ] **Step 3: Implement the fixed native-dialog command**

```ts
export function parseSelectedDirectory(output: string): string | undefined {
  const selectedDirectory = output.trim()
  return selectedDirectory === "" ? undefined : selectedDirectory
}

export function createDirectoryPicker(runDirectoryDialog: () => Promise<string>) {
  return async () => {
    try {
      return parseSelectedDirectory(await runDirectoryDialog())
    } catch (cause) {
      throw new Error("Could not open the Windows folder picker", { cause })
    }
  }
}

export const pickDirectory = createDirectoryPicker(runPowerShellFolderPicker)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/cli/folder-picker.test.ts`

Expected: PASS with 3 tests.

- [ ] **Step 5: Remove the standalone prototype artifacts**

Remove the two `src/scripts/folder-picker-prototype*` files and the
`prototype:folder-picker` entry in `package.json`.

### Task 2: Resolve a missing installation directory interactively

**Files:**
- Create: `src/cli/installation-directory.ts`
- Create: `src/cli/installation-directory.test.ts`
- Modify: `src/cli/prompts.ts`
- Modify: `src/cli/main.ts`

**Interfaces:**
- Produces: `resolveInstallationDirectory(defaultDirectory: string | undefined, prompt, dependencies): Promise<string | undefined>`.
- Produces: `directoryExists(directory): Promise<boolean>`.
- Consumes: `directoryExists(directory): Promise<boolean>`, `waitForAnyKey(message): Promise<void>`, and `pickDirectory(): Promise<string | undefined>`.

- [ ] **Step 1: Write failing default, fallback, and cancellation tests**

```ts
test("uses the default installation without prompting when it exists", async () => {
  const selected = await resolveInstallationDirectory("C:/Games/Etterna", "missing", {
    directoryExists: async () => true,
    waitForAnyKey: async () => assert.fail("must not wait"),
    pickDirectory: async () => assert.fail("must not pick"),
  })
  assert.equal(selected, "C:/Games/Etterna")
})

test("returns the selected installation after the default is missing", async () => {
  const checkedDirectories: string[] = []
  const selected = await resolveInstallationDirectory("C:/Games/Etterna", "missing", {
    directoryExists: async (directory) => {
      checkedDirectories.push(directory)
      return directory === "D:/Etterna"
    },
    waitForAnyKey: async () => undefined,
    pickDirectory: async () => "D:/Etterna",
  })
  assert.equal(selected, "D:/Etterna")
  assert.deepEqual(checkedDirectories, ["C:/Games/Etterna", "D:/Etterna"])
})

test("returns undefined when the replacement picker is cancelled", async () => {
  const selected = await resolveInstallationDirectory("C:/Games/Etterna", "missing", {
    directoryExists: async () => false,
    waitForAnyKey: async () => undefined,
    pickDirectory: async () => undefined,
  })
  assert.equal(selected, undefined)
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test src/cli/installation-directory.test.ts`

Expected: FAIL because the dedicated installation-directory module does not exist.

- [ ] **Step 3: Add a keypress prompt and directory resolver**

```ts
export async function resolveInstallationDirectory(
  defaultDirectory: string | undefined,
  prompt: string,
  dependencies: InstallationDirectoryDependencies,
): Promise<string | undefined> {
  if (defaultDirectory && await dependencies.directoryExists(defaultDirectory)) {
    return defaultDirectory
  }
  await dependencies.waitForAnyKey(prompt)
  const selectedDirectory = await dependencies.pickDirectory()
  if (!selectedDirectory) return undefined
  return (await dependencies.directoryExists(selectedDirectory)) ? selectedDirectory : undefined
}
```

The `waitForAnyKey` implementation prints the supplied message, enables raw
mode when available, resolves after one `data` event, then restores raw mode.
Implement `directoryExists` with `stat().isDirectory()`: return `false` only for
`ENOENT` or `ENOTDIR`, and wrap every other failure with installation context and `cause`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `node --test src/cli/installation-directory.test.ts && npm run typecheck`

Expected: all focused tests and TypeScript checks pass.

### Task 3: Use the resolved roots in the conversion flow

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `src/config/osu-installation.ts`
- Create: `src/config/osu-installation.test.ts`
- Modify: `src/config/paths.ts`
- Modify: `src/config/paths.test.ts`

**Interfaces:**
- Consumes: resolved Etterna and osu! installation roots from Task 2.
- Produces: `resolveOsuSkinOutputPath(skinName, osuInstallationDirectory): string`.

- [ ] **Step 1: Write the failing osu! installation-root test**

```ts
test("resolves an osu skin directory from the installation root", () => {
  assert.equal(
    resolveOsuSkinOutputPath("Converted Skin", "D:/Games/osu!"),
    path.join("D:/Games/osu!", "Skins", "Converted Skin"),
  )
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test src/config/paths.test.ts`

Expected: FAIL because the current resolver treats its second argument as `LOCALAPPDATA`.

- [ ] **Step 3: Wire the roots into `runCli` and update the path resolver**

```ts
const gameLocation = await resolveInstallationDirectory(gameDefaults.etterna.location, etternaPrompt, dependencies)
if (!gameLocation) return

const defaultOsuInstallation = resolveDefaultOsuInstallationDirectory(process.env.LOCALAPPDATA)
const osuLocation = await resolveInstallationDirectory(defaultOsuInstallation, osuPrompt, dependencies)
if (!osuLocation) return

outputDirectory: resolveOsuSkinOutputPath(reference.name, osuLocation)
```

The resolver returns `path.join(osuInstallationDirectory, "Skins", skinName)`
after its existing skin-name safety validation.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `node --test src/cli/installation-directory.test.ts src/config/osu-installation.test.ts src/config/paths.test.ts`

Expected: PASS.

### Task 4: Verify the full repository and manual dialog flow

**Files:**
- Verify only.

- [ ] **Step 1: Run all required automated checks**

Run: `npm test && npm run typecheck && npm run lint && npm run test:architecture && git diff --check`

Expected: every command exits with code 0.

- [ ] **Step 2: Manually run the CLI with each default directory temporarily unavailable**

Run: `npm start`

Expected: each missing default shows its instruction, waits for one key, opens the Windows folder dialog, and cancellation exits without an error.
