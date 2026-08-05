# Etterna Theme Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the active Etterna theme from `Preferences.ini` and replace fixed `Rebirth_settings` paths.

**Architecture:** A focused Etterna adapter parses `[Options]` from `Save/Preferences.ini`, selecting `Theme` or `DefaultTheme`. `EtternaSkinReader` receives the resolved name and supplies it to profile configuration and judgement dependencies.

**Tech Stack:** Node.js 22, TypeScript, node:test, Node filesystem promises.

## Global Constraints

- Parse only `[Options]` values; option keys are case-insensitive.
- Use non-empty `Theme`, otherwise non-empty `DefaultTheme`.
- Throw when neither option supplies a theme.
- Do not commit changes.

---

### Task 1: Resolve the active Etterna theme

**Files:**
- Create: `src/adapters/etterna/theme/read-etterna-theme.ts`
- Create: `src/adapters/etterna/theme/read-etterna-theme.test.ts`

**Interfaces:** Produces `extractEtternaTheme(source: string, preferencesPath: string): string` and `readEtternaTheme(gameRoot: string): Promise<string>`.

- [ ] **Step 1: Write failing tests**

```ts
assert.equal(extractEtternaTheme("[Options]\nTheme=Til Death\nDefaultTheme=Rebirth", "Preferences.ini"), "Til Death")
assert.equal(extractEtternaTheme("[Options]\nTheme= \nDefaultTheme=Rebirth", "Preferences.ini"), "Rebirth")
assert.equal(extractEtternaTheme("Theme=Ignored\n[Options]\nDefaultTheme=Rebirth", "Preferences.ini"), "Rebirth")
assert.throws(() => extractEtternaTheme("[Options]\nTheme=", "Preferences.ini"), /theme.*Preferences\.ini/i)
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/adapters/etterna/theme/read-etterna-theme.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the parser and file reader**

```ts
export async function readEtternaTheme(gameRoot: string): Promise<string> {
  const preferencesPath = path.join(gameRoot, "Save", "Preferences.ini")
  return extractEtternaTheme(await readFile(preferencesPath, "utf8"), preferencesPath)
}
```

Parse line-by-line only after `[Options]` and before the next section; compare keys with
`toLowerCase()`, trim values, prefer `theme`, then `defaulttheme`, and throw if both are empty.

- [ ] **Step 4: Verify GREEN**

Run: `node --test src/adapters/etterna/theme/read-etterna-theme.test.ts`

Expected: PASS.

### Task 2: Propagate the resolved theme to all Etterna settings reads

**Files:**
- Modify: `src/adapters/etterna/profile/read-etterna-profile.ts`
- Modify: `src/adapters/etterna/judgements/read-etterna-judgements.ts`
- Modify: `src/adapters/etterna/assets/read-etterna-judgement-selection.ts`
- Modify: `src/adapters/etterna/reader/etterna-skin-reader.ts`
- Modify: their colocated tests and `tests/integration/etterna-to-osu.test.ts`.

**Interfaces:** `readEtternaProfile(gameRoot, profileId, theme)`, `readEtternaJudgements(gameRoot, profileId, theme)`, and `new EtternaSkinReader({ profileId, theme }, dependencies?)`.

- [ ] **Step 1: Write failing path tests**

```ts
await readEtternaProfile(root, "00000001", "Til Death")
// Fixture path is LocalProfiles/00000001/Til Death_settings/playerConfig.lua.
await readEtternaJudgements(root, "00000001", "Til Death")
// Fixture path is Save/Til Death_settings/assetsConfig.lua.
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/adapters/etterna/profile/read-etterna-profile.test.ts src/adapters/etterna/assets/read-etterna-judgement-selection.test.ts`

Expected: FAIL because paths still contain `Rebirth_settings`.

- [ ] **Step 3: Implement theme propagation**

```ts
const profileDirectory = path.join(gameRoot, "Save", "LocalProfiles", profileId, `${theme}_settings`)
const configPath = path.join(gameRoot, "Save", `${theme}_settings`, "assetsConfig.lua")
```

Resolve the theme once in the CLI after profile selection, pass it through the reader's named
configuration object, and supply the same value to profile and judgement operations. Use the
validated Etterna settings-path module for both profile-local and global theme paths.

- [ ] **Step 4: Verify GREEN and full suite**

Run: `npm test; npm run typecheck; npm run lint; npm run test:architecture; git diff --check`

Expected: every command exits successfully.
