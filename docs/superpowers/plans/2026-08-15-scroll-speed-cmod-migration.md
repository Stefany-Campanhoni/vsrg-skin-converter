# Scroll Speed and CMod Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate osu!mania `ManiaSpeed` to an Etterna CMod and migrate an Etterna CMod back to the current Windows user's integer `ManiaSpeed`, including osu!-to-Etterna scroll direction.

**Architecture:** Extend the playfield model with scroll state, keep format parsing/rendering in the game adapters, and keep numeric equivalence in the direction-specific conversions. Replace Etterna-to-osu!'s single-directory publication with an osu! installer that transactionally publishes the skin directory and guarded CFG rewrite together.

**Tech Stack:** TypeScript ESM, Node.js 22 test runner, filesystem promises, existing ports and adapters, `TransactionalOutputSetPublisher`.

**Spec:** `docs/superpowers/specs/2026-08-15-scroll-speed-cmod-migration-design.md`

## Global Constraints

- Preserve CFG selection by `Username` for osu!-to-Etterna.
- Etterna-to-osu! targets only `osu!.<current Windows username>.cfg` and never prompts for another CFG.
- Report the instruction to start osu! at least once only when Etterna-to-osu! prepares a missing target CFG replacement.
- Source and converted `ManiaSpeed`/CMod values are positive integers.
- Use the supplied formulas exactly and `Math.round` the final Etterna-to-osu! value.
- In the unique 4K Mania section, `UpsideDown: 1` omits `Reverse`; `0` or absence emits `Reverse,`.
- Preserve unrelated CFG content, guard it with the original SHA-256, and publish skin plus CFG atomically.
- Preserve and intentionally incorporate the user's current `src/templates/etterna/profile/Etterna.xml` edit.

---

### Task 1: Populate source scroll state

**Files:**
- Modify: `src/domain/skin.ts`
- Modify: `src/adapters/osu/config/osu-user-configuration.ts`
- Modify: `src/adapters/osu/config/osu-user-configuration.test.ts`
- Modify: `src/adapters/osu/skin-ini/osu-skin-ini.ts`
- Modify: `src/adapters/osu/skin-ini/osu-skin-ini.test.ts`
- Modify: `src/adapters/osu/reader/osu-skin-reader.ts`
- Modify: `src/adapters/osu/reader/osu-skin-reader.test.ts`
- Create: `src/adapters/etterna/profile/read-etterna-cmod.ts`
- Create: `src/adapters/etterna/profile/read-etterna-cmod.test.ts`
- Modify: `src/adapters/etterna/profile/read-etterna-profile.ts`
- Modify: `src/adapters/etterna/reader/etterna-skin-reader.ts`
- Modify: `src/adapters/etterna/reader/etterna-skin-reader.test.ts`
- Modify: `src/cli/routes/run-osu-to-etterna.ts`
- Modify: `src/cli/routes/run-osu-to-etterna.test.ts`
- Modify: `tests/integration/osu-to-etterna.test.ts`
- Modify: typed `SkinModel` fixtures found by `rg -n 'SkinModel|playfield:\s*\{' src tests -g '*.ts'`

**Interfaces:**
- Produces: required `PlayfieldConfiguration.scrollSpeed: number` and optional `isDownscroll?: boolean`.
- Produces: `OsuUserConfiguration.maniaSpeed: number` and `OsuMania4kDefinition.isDownscroll: boolean`.
- Produces: `readEtternaCmod(gameRoot: string, profileId: string): Promise<number>` and `extractEtternaCmod(source: string, profilePath: string): number`.

- [ ] **Step 1: Write failing source-parser tests**

```ts
assert.equal(parseOsuUserConfiguration(
  "Username = Alice\nFullscreen = 0\nWidth = 1280\nHeight = 720\nManiaSpeed = 29",
  "C:/osu!/osu!.Alice.cfg",
).maniaSpeed, 29)

for (const invalid of ["", "0", "29.5", "fast"]) {
  assert.throws(() => parseOsuUserConfiguration(
    `Username = Alice\nFullscreen = 0\nWidth = 1280\nHeight = 720\nManiaSpeed = ${invalid}`,
    "C:/osu!/osu!.Alice.cfg",
  ), /ManiaSpeed.*osu!\.Alice\.cfg/i)
}

assert.equal(readOsuMania4kDefinition(parseOsuSkinIni(fourKeyIni("UpsideDown: 1"), "skin.ini"), "skin.ini").isDownscroll, true)
assert.equal(readOsuMania4kDefinition(parseOsuSkinIni(fourKeyIni("UpsideDown: 0"), "skin.ini"), "skin.ini").isDownscroll, false)
assert.equal(readOsuMania4kDefinition(parseOsuSkinIni(fourKeyIni(""), "skin.ini"), "skin.ini").isDownscroll, false)
assert.throws(() => readOsuMania4kDefinition(parseOsuSkinIni(fourKeyIni("UpsideDown: 2"), "skin.ini"), "skin.ini"), /UpsideDown.*skin\.ini/i)

assert.equal(extractEtternaCmod(
  "<Stats><GeneralData><DefaultModifiers><dance>C888, Reverse, Overhead, Pink</dance></DefaultModifiers></GeneralData></Stats>",
  "C:/Etterna/Save/LocalProfiles/00000001/Etterna.xml",
), 888)
```

Also test missing, duplicated, fractional, zero, and negative CMods with the profile path. Update reader tests to expect `scrollSpeed` and osu! direction.

- [ ] **Step 2: Run focused tests and verify RED**

```sh
node --test src/adapters/osu/config/osu-user-configuration.test.ts src/adapters/osu/skin-ini/osu-skin-ini.test.ts src/adapters/osu/reader/osu-skin-reader.test.ts src/adapters/etterna/profile/read-etterna-cmod.test.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts
```

Expected: missing-field and missing-module failures.

- [ ] **Step 3: Implement adapters and model fields**

```ts
export interface PlayfieldConfiguration {
  hitPosition: number
  judgementPosition: number
  comboPosition: number
  columnWidth: number
  comboScale: number
  judgementScale: number
  scrollSpeed: number
  isDownscroll?: boolean
}
```

Parse `ManiaSpeed` with `Number.isInteger(value) && value > 0`. Parse direction with:

```ts
function readIsDownscroll(properties: ReadonlyMap<string, string>, filePath: string): boolean {
  const value = properties.get("upsidedown")
  if (value === undefined || value === "0") return false
  if (value === "1") return true
  throw invalidProperty("UpsideDown", filePath)
}
```

Require exactly one `<DefaultModifiers>`, one nested `<dance>`, and one comma-delimited `/^C\d+$/i` modifier. Resolve the selected profile through `resolveEtternaProfilePath` and wrap reads with the exact XML path.

Return `Omit<PlayfieldConfiguration, "scrollSpeed" | "isDownscroll">` from the Lua profile reader. `EtternaSkinReader` reads Lua playfield and CMod concurrently and merges them. `OsuSkinReaderConfiguration` receives `scrollSpeed`; its result merges that value with the 4K `isDownscroll`. Pass the selected configuration's `maniaSpeed` from the osu!-to-Etterna route and integration fixture. Add `scrollSpeed: 1` to unrelated typed fixtures.

- [ ] **Step 4: Verify GREEN and commit**

```sh
node --test src/adapters/osu/config/osu-user-configuration.test.ts src/adapters/osu/skin-ini/osu-skin-ini.test.ts src/adapters/osu/reader/osu-skin-reader.test.ts src/adapters/etterna/profile/read-etterna-cmod.test.ts src/adapters/etterna/profile/read-etterna-profile.test.ts src/adapters/etterna/reader/etterna-skin-reader.test.ts
npm run typecheck
git add src/domain/skin.ts src/adapters/osu/config/osu-user-configuration.ts src/adapters/osu/config/osu-user-configuration.test.ts src/adapters/osu/skin-ini src/adapters/osu/reader src/adapters/etterna/profile/read-etterna-cmod.ts src/adapters/etterna/profile/read-etterna-cmod.test.ts src/adapters/etterna/profile/read-etterna-profile.ts src/adapters/etterna/profile/read-etterna-profile.test.ts src/adapters/etterna/reader src/cli/routes/run-osu-to-etterna.ts src/cli/routes/run-osu-to-etterna.test.ts src/application/conversion/*.test.ts src/conversions/*/*.test.ts src/adapters/etterna/install/*.test.ts src/adapters/etterna/writer/*.test.ts src/adapters/osu/writer/*.test.ts tests/integration/osu-to-etterna.test.ts
git diff --cached --name-only
git commit -m "feat: read source scroll settings"
```

---

### Task 2: Convert ManiaSpeed and CMod

**Files:**
- Create: `src/conversions/osu-to-etterna/convert-scroll-speed.ts`
- Create: `src/conversions/osu-to-etterna/convert-scroll-speed.test.ts`
- Modify: `src/conversions/osu-to-etterna/osu-to-etterna-conversion.ts`
- Modify: `src/conversions/osu-to-etterna/osu-to-etterna-conversion.test.ts`
- Create: `src/conversions/etterna-to-osu/convert-scroll-speed.ts`
- Create: `src/conversions/etterna-to-osu/convert-scroll-speed.test.ts`
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.ts`
- Modify: `src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts`

**Interfaces:**
- Produces: `getEtternaCmod(maniaSpeed: number, receptorSize: number): number`.
- Produces: `getOsuManiaSpeed(cmod: number, receptorSize: number): number`.

- [ ] **Step 1: Write failing formula tests**

```ts
assert.equal(getEtternaCmod(29, 106), 902)
assert.equal(getOsuManiaSpeed(888, 108), 29)
for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => getEtternaCmod(invalid, 100), /positive finite ManiaSpeed/i)
  assert.throws(() => getOsuManiaSpeed(invalid, 100), /positive integer CMod/i)
}
```

Add class tests proving osu! width `68` becomes receptor size `106` before speed conversion, and Etterna receptor size `108` is used before it becomes osu! width `70`.

- [ ] **Step 2: Run and verify RED**

```sh
node --test src/conversions/osu-to-etterna/convert-scroll-speed.test.ts src/conversions/osu-to-etterna/osu-to-etterna-conversion.test.ts src/conversions/etterna-to-osu/convert-scroll-speed.test.ts src/conversions/etterna-to-osu/etterna-to-osu-conversion.test.ts
```

- [ ] **Step 3: Implement exact formulas**

```ts
export function getEtternaCmod(maniaSpeed: number, receptorSize: number): number {
  assertPositiveFinite(maniaSpeed, "ManiaSpeed")
  assertPositiveFinite(receptorSize, "receptor size")
  const correction = receptorSize > 100 ? 35 : 0
  return Math.round(((435.59 * maniaSpeed) / 13.72 + correction) / (receptorSize / 100))
}
```

```ts
export function getOsuManiaSpeed(cmod: number, receptorSize: number): number {
  if (!Number.isInteger(cmod) || cmod <= 0) throw new Error("Expected a positive integer CMod")
  assertPositiveFinite(receptorSize, "receptor size")
  let candidate = Number(((435 * cmod) / 13720).toFixed(2))
  while (getEtternaCmod(candidate, receptorSize) < cmod) candidate += 1
  return Math.round(candidate)
}
```

Calculate converted receptor size first in osu!-to-Etterna. Preserve source receptor size before column-width conversion in Etterna-to-osu!.

- [ ] **Step 4: Verify GREEN and commit**

```sh
node --test src/conversions/osu-to-etterna/*.test.ts src/conversions/etterna-to-osu/*.test.ts
npm run typecheck
git add src/conversions
git commit -m "feat: convert mania speed and cmod"
```

---

### Task 3: Render Etterna CMod and direction

**Files:**
- Modify: `src/templates/etterna/profile/Etterna.xml`
- Modify: `src/adapters/etterna/templates/render-etterna-profile.ts`
- Modify: `src/adapters/etterna/templates/render-etterna-profile.test.ts`
- Modify: `src/adapters/etterna/writer/etterna-profile-writer.ts`
- Modify: `src/adapters/etterna/writer/etterna-profile-writer.test.ts`

**Interfaces:**
- Consumes: target `scrollSpeed`, optional `isDownscroll`, and `metadata.name`.
- Produces: resolved `${cmod}`, `${is_downscroll}`, and `${skin_name}` XML wildcards.

- [ ] **Step 1: Write failing renderer tests**

Assert an upscroll result equals `<dance>C888, Reverse, Overhead, Pink &amp; Blue</dance>`. Assert a downscroll result has no `Reverse`. Reject non-positive/non-integer CMod and line breaks in the skin name.

- [ ] **Step 2: Run and verify RED**

```sh
node --test src/adapters/etterna/templates/render-etterna-profile.test.ts src/adapters/etterna/writer/etterna-profile-writer.test.ts
```

- [ ] **Step 3: Render approved values**

```ts
const xml = renderOwnedTemplate("Etterna.xml", xmlTemplate, {
  profile_name: escapeXmlText(values.profileName),
  guid: values.guid,
  cmod: values.cmod,
  is_downscroll: values.isDownscroll ? "" : "Reverse,",
  skin_name: escapeXmlText(values.skinName),
})
```

Add `skinName`, `cmod`, and `isDownscroll` to `EtternaProfileTemplateValues`. Pass them from `EtternaProfileWriter`; default absent direction to upscroll. Keep the user's template structure and change only the speed prefix from `c` to uppercase `C`.

- [ ] **Step 4: Verify GREEN and commit**

```sh
node --test src/adapters/etterna/templates/render-etterna-profile.test.ts src/adapters/etterna/writer/etterna-profile-writer.test.ts src/adapters/etterna/install/etterna-skin-installer.test.ts
git diff --check
git add src/templates/etterna/profile/Etterna.xml src/adapters/etterna/templates src/adapters/etterna/writer/etterna-profile-writer.ts src/adapters/etterna/writer/etterna-profile-writer.test.ts
git commit -m "feat: render etterna cmod modifiers"
```

---

### Task 4: Prepare guarded osu! CFG updates

**Files:**
- Create: `src/adapters/osu/config/prepare-osu-user-configuration-update.ts`
- Create: `src/adapters/osu/config/prepare-osu-user-configuration-update.test.ts`

**Interfaces:**
- Produces: `PreparedOsuUserConfigurationUpdate` with `targetPath`, `content`, and SHA-256 `expectation`.
- Produces: `prepareOsuUserConfigurationUpdate(osuRoot: string, windowsUsername: string | undefined, maniaSpeed: number): Promise<PreparedOsuUserConfigurationUpdate>`.
- Produces: `writeOsuUserConfigurationUpdate(outputFile: string, update: PreparedOsuUserConfigurationUpdate): Promise<void>`.

- [ ] **Step 1: Write failing discovery and rewrite tests**

Cover a mixed-case actual filename, CRLF preservation, property whitespace, unrelated properties, absent `ManiaSpeed`, absent Windows username, missing current-user file, read errors, and write errors:

```ts
assert.equal(update.targetPath, path.join(osuRoot, "OSU!.Stefany.CFG"))
assert.equal(update.content,
  "Username = Stefany\r\n  ManiaSpeed = 29\r\nVolume = 80\r\n")
assert.equal(update.expectation.state, "sha256")
```

The missing-file error must include `Stefany`, the expected filename, and match `/start osu! at least once/i`.

- [ ] **Step 2: Run and verify RED**

```sh
node --test src/adapters/osu/config/prepare-osu-user-configuration-update.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement discovery and guarded replacement**

Validate a non-empty Windows username without line breaks. List only immediate regular files and choose exactly one case-insensitive match for `osu!.${windowsUsername}.cfg`. Translate `ENOENT` during discovery or opening into the approved guidance; wrap other failures with path context and `cause`.

```ts
const maniaSpeedPattern = /^([ \t]*ManiaSpeed[ \t]*=[ \t]*)([^\r\n]*)(\r?)$/gim
const matches = [...source.matchAll(maniaSpeedPattern)]
if (matches.length !== 1) {
  throw new Error(`Expected exactly one ManiaSpeed assignment in ${targetPath}`)
}
const content = source.replace(
  maniaSpeedPattern,
  (_line, prefix: string, _value: string, carriageReturn: string) =>
    `${prefix}${maniaSpeed}${carriageReturn}`,
)
```

Return the SHA-256 of the original `Buffer` as a `FileContentExpectation`. Write UTF-8 through a separate contextual writer function.

- [ ] **Step 4: Verify GREEN and commit**

```sh
node --test src/adapters/osu/config/prepare-osu-user-configuration-update.test.ts
npm run typecheck
git add src/adapters/osu/config/prepare-osu-user-configuration-update.ts src/adapters/osu/config/prepare-osu-user-configuration-update.test.ts
git commit -m "feat: prepare guarded osu config updates"
```

---

### Task 5: Install osu! skin and CFG atomically

**Files:**
- Create: `src/adapters/osu/install/osu-skin-installer.ts`
- Create: `src/adapters/osu/install/osu-skin-installer.test.ts`

**Interfaces:**
- Consumes: converted osu! model, Windows username, osu! root, target skin directory, `OsuSkinWriter`, CFG update functions, and `OutputSetPublisher`.
- Produces: `OsuSkinInstallerConfiguration` and `OsuSkinInstaller` implementing `SkinInstaller`.

- [ ] **Step 1: Write failing installer tests**

Capture the published target set and assert:

```ts
assert.deepEqual(targets.map(({ kind, targetPath, allowedRoot, policy }) => ({
  kind, targetPath, allowedRoot, policy,
})), [
  {
    kind: "directory",
    targetPath: "C:/osu!/Skins/Pink",
    allowedRoot: "C:/osu!/Skins",
    policy: "replace-existing",
  },
  {
    kind: "file",
    targetPath: "C:/osu!/osu!.Stefany.cfg",
    allowedRoot: "C:/osu!",
    policy: "replace-existing",
  },
])
```

Assert the file target carries the prepared expectation, builders call their respective writers, preparation receives integer `skin.playfield.scrollSpeed`, mismatched game/name fails early, and prepare failure prevents publication. Add a filesystem-backed failure case proving original skin and CFG restoration if the second promotion fails.

- [ ] **Step 2: Run and verify RED**

```sh
node --test src/adapters/osu/install/osu-skin-installer.test.ts
```

- [ ] **Step 3: Implement the installer**

```ts
export interface OsuSkinInstallerConfiguration {
  readonly gameRoot: string
  readonly windowsUsername: string | undefined
  readonly expectedSkinName: string
  readonly skinTarget: string
}
```

Prepare the CFG only inside `installSkin`, after validating the converted game and exact skin name, then publish:

```ts
await publisher.publish([
  {
    kind: "directory",
    targetPath: configuration.skinTarget,
    allowedRoot: path.join(configuration.gameRoot, "Skins"),
    policy: "replace-existing",
    build: (workspace) => skinWriter.writeSkin(skin, workspace),
  },
  {
    kind: "file",
    targetPath: update.targetPath,
    allowedRoot: configuration.gameRoot,
    policy: "replace-existing",
    expectedContent: update.expectation,
    build: (stagingFile) => configWriter.writeUpdate(stagingFile, update),
  },
])
```

- [ ] **Step 4: Verify GREEN and commit**

```sh
node --test src/adapters/osu/install/osu-skin-installer.test.ts src/infrastructure/filesystem/transactional-output-set-publisher.test.ts
npm run test:architecture
git add src/adapters/osu/install
git commit -m "feat: install osu skin and speed atomically"
```

---

### Task 6: Wire the Etterna-to-osu! CLI route

**Files:**
- Modify: `src/cli/routes/run-etterna-to-osu.ts`
- Modify: `src/cli/routes/run-etterna-to-osu.test.ts`

**Interfaces:**
- Consumes: injected `windowsUsername`, defaulting to `process.env.USERNAME`, in Etterna-to-osu!.
- Produces: Etterna-to-osu! through `convertAndInstallSkin` and `OsuSkinInstaller`, without a target-CFG prompt.

- [ ] **Step 1: Write failing route tests**

Assert the Etterna-to-osu! route constructs the installer with:

```ts
assert.deepEqual(installConfiguration, {
  gameRoot: "C:/Users/Alice/osu!",
  windowsUsername: "Stefany",
  expectedSkinName: "Diamond",
  skinTarget: "C:/Users/Alice/osu!/Skins/Diamond",
})
assert.deepEqual(conversionRequest, { reference: skin, targetGame: "osu" })
```

Keep all cancellation tests and prove no CFG-list/select event is introduced.

- [ ] **Step 2: Run and verify RED**

```sh
node --test src/cli/routes/run-etterna-to-osu.test.ts
```

- [ ] **Step 3: Update composition**

Compose `OsuSkinInstaller` with `OsuSkinWriter`, the CFG preparation/writer, and `TransactionalOutputSetPublisher`, then call `convertAndInstallSkin`. Keep `resolveOsuSkinOutputPath` for the validated target directory. Do not open the target CFG in the route; the installer does that after conversion.

- [ ] **Step 4: Verify GREEN and commit**

```sh
node --test src/cli/routes/run-osu-to-etterna.test.ts src/cli/routes/run-etterna-to-osu.test.ts src/cli/run-cli-command.test.ts
npm run typecheck
git add src/cli/routes
git commit -m "feat: wire scroll speed migration routes"
```

---

### Task 7: Prove end-to-end migration and document it

**Files:**
- Modify: `tests/integration/osu-to-etterna.test.ts`
- Modify: `tests/integration/etterna-to-osu.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: all source, conversion, rendering, installer, and transaction behavior.
- Produces: integration regression coverage and user-facing documentation.

- [ ] **Step 1: Extend integration fixtures and verify RED**

For osu!-to-Etterna, add `ManiaSpeed = 29` to `osu!.Alice.cfg`, add `UpsideDown: 0` to the unique 4K section, pass `configuration.maniaSpeed` to the reader, and assert:

```xml
<dance>C902, Reverse, Overhead, General Name</dance>
```

Add a downscroll assertion that the generated `<dance>` has no `Reverse`.

For Etterna-to-osu!, add `C888` to the selected profile XML, create `osu!.Stefany.cfg` with `ManiaSpeed = 10` and an unrelated property, switch the fixture to `convertAndInstallSkin` plus the production osu! installer and output-set publisher, and assert `ManiaSpeed = 28` for its existing `ReceptorSize = 100`.

```sh
node --test tests/integration/osu-to-etterna.test.ts tests/integration/etterna-to-osu.test.ts
```

Expected: integration failures until the fixtures follow the new flow.

- [ ] **Step 2: Complete integration and rollback coverage**

Use production adapters in both fixtures. Add a failure after one Etterna-to-osu! target promotion and assert the old skin marker and original CFG are both restored. Preserve all existing asset, pixel, coordinate, and overwrite assertions.

- [ ] **Step 3: Update documentation**

Document the selected source CFG, 4K `UpsideDown`, selected Etterna profile CMod, current-Windows-user target lookup, start-osu guidance, integer output, atomic publication, both formulas, and the `C888`/`ReceptorSize 108` to `ManiaSpeed 29` example.

- [ ] **Step 4: Verify GREEN and commit**

```sh
node --test tests/integration/osu-to-etterna.test.ts tests/integration/etterna-to-osu.test.ts
git diff --check
git add tests/integration README.md docs/architecture.md
git commit -m "test: cover scroll speed migration end to end"
```

---

### Task 8: Run complete verification and compatibility audit

**Files:**
- Verify only; modify a file only when a failing check exposes a defect within this specification.

**Interfaces:**
- Consumes: completed implementation and repository quality commands.
- Produces: fresh evidence for the feature and all existing behavior.

- [ ] **Step 1: Run the full gate**

```sh
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
```

Expected: every command exits zero with no failures, type errors, lint errors, unused declarations, or whitespace errors.

- [ ] **Step 2: Audit applicable real fixtures**

Use the readers against applicable skins below `tmp` without publishing over real installations. Confirm a real Etterna profile CMod and an osu! 4K `UpsideDown`/CFG `ManiaSpeed` pairing when present. If the corpus lacks those profile/CFG files, record that exact absence instead of claiming compatibility evidence.

- [ ] **Step 3: Review final scope**

```sh
git status --short
git log --oneline -8
git diff HEAD~7 -- src tests README.md docs/architecture.md
```

Check every source-selection, conversion, direction, rendering, missing-CFG, concurrency, and rollback requirement. Ensure no build, release, cache, or unrelated user file is included.
