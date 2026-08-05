# Etterna Profile Selection Implementation Plan

> Historical note: theme resolution subsequently extended the reader configuration. The
> current interface is `new EtternaSkinReader({ profileId, theme }, dependencies?)`, and all
> profile/theme path composition uses the validated Etterna settings-path module. The snippets
> below record the original red/green sequence and are not current implementation guidance;
> use the production source and `docs/architecture.md` as the authoritative references.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Etterna CLI select a local profile and use it for playfield configuration and judgement assets.

**Architecture:** Add an Etterna profile catalog beneath `Save/LocalProfiles`. The CLI selects an ID once and constructs the Etterna reader with it, ensuring configuration and judgement reads share the selected profile.

**Tech Stack:** Node.js 22, TypeScript, node:test, `@clack/prompts`, Node filesystem promises.

## Global Constraints

- Keep profile filesystem and XML knowledge in `src/adapters/etterna`.
- Do not add profile data to `SkinReference` or `SkinModel`.
- Use `askSelect` for multiple profiles.
- Missing or empty `DisplayName` labels are `unknown`.
- No profile directories must produce an actionable error.
- Write each behavior test before production code.

---

### Task 1: Discover Etterna local profiles

**Files:**
- Create: `src/adapters/etterna/profile/etterna-profile-catalog.ts`
- Create: `src/adapters/etterna/profile/etterna-profile-catalog.test.ts`

**Interfaces:** Produces `EtternaProfile = { id: string; displayName: string }` and `listEtternaProfiles(gameRoot: string): Promise<EtternaProfile[]>`.

- [ ] **Step 1: Write failing tests**

```ts
test("lists profiles in directory-ID order", async () => {
  assert.deepEqual(await listEtternaProfiles(root), [
    { id: "00000000", displayName: "First" },
    { id: "00000001", displayName: "Second" },
  ])
})
test("uses unknown for missing or empty DisplayName", async () => {
  assert.deepEqual(await listEtternaProfiles(root), [
    { id: "empty", displayName: "unknown" },
    { id: "missing", displayName: "unknown" },
  ])
})
test("rejects an empty LocalProfiles directory", async () => {
  await assert.rejects(() => listEtternaProfiles(root), /No Etterna profiles found/i)
})
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/adapters/etterna/profile/etterna-profile-catalog.test.ts`

Expected: FAIL because the catalog module does not exist.

- [ ] **Step 3: Implement the minimal catalog**

```ts
export interface EtternaProfile { id: string; displayName: string }
export async function listEtternaProfiles(gameRoot: string): Promise<EtternaProfile[]> {
  const directory = path.join(gameRoot, "Save", "LocalProfiles")
  const profiles = await Promise.all((await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => ({
      id: entry.name,
      displayName: extractEtternaProfileDisplayName(
        await readFile(path.join(directory, entry.name, "Etterna.xml"), "utf8"),
      ),
    })))
  if (profiles.length === 0) throw new Error(`No Etterna profiles found in ${directory}`)
  return profiles.sort((left, right) => left.id.localeCompare(right.id))
}
```

Implement `extractEtternaProfileDisplayName(source)` using a case-insensitive `DisplayName` match, trimming content and returning `unknown` if absent or empty.

- [ ] **Step 4: Verify GREEN**

Run: `node --test src/adapters/etterna/profile/etterna-profile-catalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/adapters/etterna/profile/etterna-profile-catalog.ts src/adapters/etterna/profile/etterna-profile-catalog.test.ts; git commit -m "feat: discover Etterna local profiles"`

### Task 2: Use the selected profile across Etterna reads

**Files:**
- Modify: `src/adapters/etterna/profile/read-etterna-profile.ts`
- Modify: `src/adapters/etterna/profile/read-etterna-profile-guid.ts`
- Modify: `src/adapters/etterna/judgements/read-etterna-judgements.ts`
- Modify: `src/adapters/etterna/reader/etterna-skin-reader.ts`
- Modify: the colocated tests.

**Interfaces:** Initially produced `readEtternaProfile(gameRoot, profileId)`, `readEtternaProfileGuid(gameRoot, profileId)`, `readEtternaJudgements(gameRoot, profileId)`, and `new EtternaSkinReader(profileId, dependencies?)`. See the historical note for the current reader interface.

- [ ] **Step 1: Write failing tests**

```ts
test("reads playerConfig from the requested profile", async () => {
  assert.equal((await readEtternaProfile(root, "selected")).columnWidth, 106)
})
test("reads the GUID from the requested profile", async () => {
  assert.equal(await readEtternaProfileGuid(root, "selected"), "selected-guid")
})
test("passes its profile ID to profile and judgement dependencies", async () => {
  const reader = new EtternaSkinReader("selected", {
    readProfile: async (_root, id) => { assert.equal(id, "selected"); return fixturePlayfield },
    analyzeJudgements: async (_root, id) => { assert.equal(id, "selected"); return fixtureJudgements },
    loadNoteSkinContext: async () => fixtureContext,
    analyzeReceptors: async () => fixtureReceptors,
    analyzeNotes: async () => fixtureNotes,
  })
  await reader.readSkin(fixtureReference)
})
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/adapters/etterna/profile/read-etterna-profile.test.ts src/adapters/etterna/profile/read-etterna-profile-guid.test.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts`

Expected: FAIL because these interfaces lack `profileId`.

- [ ] **Step 3: Implement profile-ID propagation**

```ts
export async function readEtternaProfile(gameRoot: string, profileId: string) {
  const profileDirectory = path.join(gameRoot, "Save", "LocalProfiles", profileId, "Rebirth_settings")
  const entries = await readdir(profileDirectory, { recursive: true, withFileTypes: true })
  // Retain the current case-insensitive playerConfig.lua filtering and Lua parsing.
}
export async function readEtternaProfileGuid(gameRoot: string, profileId: string) {
  const profilePath = path.join(gameRoot, "Save", "LocalProfiles", profileId, "Etterna.xml")
  return extractEtternaProfileGuid(await readFile(profilePath, "utf8"), profilePath)
}
```

Change judgement-analysis and reader dependency signatures to accept the same ID. Store it in `EtternaSkinReader` and pass it to both asynchronous profile-dependent operations.

- [ ] **Step 4: Verify GREEN**

Run: `node --test src/adapters/etterna/profile/read-etterna-profile.test.ts src/adapters/etterna/profile/read-etterna-profile-guid.test.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/adapters/etterna/profile src/adapters/etterna/judgements/read-etterna-judgements.ts src/adapters/etterna/reader/etterna-skin-reader.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts; git commit -m "feat: read the selected Etterna profile"`

### Task 3: Select the profile in the CLI and verify end-to-end behavior

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `docs/architecture.md`

**Interfaces:** Consumes `listEtternaProfiles(gameLocation)` and `askSelect(message, options)` and produces a configured `EtternaSkinReader`.

- [ ] **Step 1: Write the failing integration test**

```ts
test("converts using a non-default profile", async () => {
  const selectedProfile = path.join(gameRoot, "Save", "LocalProfiles", "00000001")
  await writeFile(path.join(selectedProfile, "Etterna.xml"), "<Stats><Guid>selected-guid</Guid></Stats>")
  await writeFile(path.join(selectedProfile, "Rebirth_settings", "playerConfig.lua"), selectedConfig)
  const reader = new EtternaSkinReader("00000001")
  // Run conversion and assert its skin.ini coordinates and judgement pixels come from selectedProfile.
})
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/integration/etterna-to-osu.test.ts`

Expected: FAIL because the CLI has no profile discovery or selection flow.

- [ ] **Step 3: Implement selection before skin selection**

```ts
const profiles = await listEtternaProfiles(gameLocation)
const profileId = profiles.length === 1 ? profiles[0]?.id : await askSelect(
  "Select the Etterna profile:",
  profiles.map((profile) => ({ value: profile.id, label: profile.displayName })),
)
if (!profileId) return
const readers = new Map<GameId, SkinReader>([["etterna", new EtternaSkinReader(profileId)]])
```

Create the reader after profile selection. Preserve cancellation behavior and update architecture text to describe the selected profile rather than a fixed profile.

- [ ] **Step 4: Verify GREEN and full suite**

Run: `npm test; npm run typecheck; npm run lint; npm run test:architecture; git diff --check`

Expected: every command exits successfully.

- [ ] **Step 5: Commit**

Run: `git add src/cli/main.ts tests/integration/etterna-to-osu.test.ts docs/architecture.md; git commit -m "feat: select Etterna profiles in the CLI"`
