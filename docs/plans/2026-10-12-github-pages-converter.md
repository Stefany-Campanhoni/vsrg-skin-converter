# GitHub Pages Browser Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a browser-only 4K Etterna/osu!mania converter with directory inputs, downloadable results, and one migration core shared with the existing CLI.

**Architecture:** CLI and web are independent composition roots over the same application operations, game adapters, conversion mappings, and image-operation policies. Narrow file/image/output ports supply native and browser mechanisms. Full migration preserves its speed requirement; a visual operation reuses the same mappings without a fabricated speed.

**Tech Stack:** Bun 1.4.0, strict TypeScript, HTML/CSS, existing luaparse and Sharp; browser libvips through `wasm-vips@0.0.18`, `fflate@0.8.3`, `coi-serviceworker@0.1.7`, and `@playwright/test@1.64.0`. Exact new versions are implementation pins, not permission to update current migration dependencies.

**Spec:** [Approved design](../specs/2026-10-12-github-pages-converter-design.md).

## Global Constraints

- Preserve every existing migration business rule. Modularize the implementation so multiple entrypoints use the same migration core and format policies.
- Preserve formulas, validation, rounding, calibrated constants, required assets, density precedence, allowed fallbacks, processing order, dimensions, filenames, scale factors, scroll semantics, and diagnostics.
- Do not make speed optional in the existing complete-input model to accommodate a folder-only request, and do not insert a dummy source speed.
- Etterna to osu!mania takes the installation directory and selected skin/profile; osu!mania to Etterna takes only the skin directory and excludes speed migration.
- Use https://cmodcalc.com/ as an ordinary external link, without source values in its URL.
- No backend, account, upload, source mutation, automatic installation, or copying algorithms into an entrypoint.
- Follow TDD for production changes and do not introduce TypeScript `any`.
- Browser source files/handles remain session-only. Fetch only the site's own bundled templates and code.
- Preserve decoded image pixels, not necessarily PNG encoding bytes; no unverified Canvas substitution.
- Bound input assets to 32 MiB encoded and 16 megapixels decoded, and converted output to 256 MiB.
- Complete and settle all output tasks before exposing a ZIP; preserve native publication/rollback guarantees.
- Bun remains 1.4.0. Use kebab-case modules, named exports, typed ports, English identifiers/diagnostics/documentation, and the existing dependency matrix.
- No generated website, reference captures, local game data, or build cache is committed. Commit generated test fixtures only when deterministic, synthetic, and necessary as a regression reference.
- Every implementation commit uses Conventional Commits; the PR carries a minor Changeset. Never manually bump the package or changelog version.

## Review Focus

1. Reset or direction change while conversion is pending: the previous request must not reveal a download or overwrite the new selection (Task 8).
2. Directory file input retains a common top-level folder and contains unrelated files: strip exactly the selected root, preserve nested skin paths, and never read unrelated bytes (Task 4).
3. Configuration is malformed or permission is lost: surface the failure rather than treating it as an absent file and substituting defaults (Task 5).
4. An explicit `@2x` reference is missing while SD exists: keep the current authoritative-reference failure; do not invent a density fallback (Task 5).
5. First-visit browser isolation or a WASM/worker URL fails under the repository subpath: finish initialization before directory selection, avoid reload loops, and report an actionable failure (Tasks 3, 8, and 9).

## File and dependency map

| Owner | Files and responsibility |
| --- | --- |
| Domain | `src/domain/visual-skin.ts`, `src/domain/generated-file.ts`: visual subset and generated relative files; existing full `SkinModel` stays required-speed. |
| Application | `src/application/ports/source-files.ts`, `asset-loader.ts`, `image-operations.ts`, `generated-files.ts`, `visual-skin-reader.ts`, `visual-skin-exporter.ts`; `src/application/conversion/convert-visual-skin.ts` and `visual-conversion-registry.ts`: coordination and contracts. |
| Conversions | `src/conversions/etterna-to-osu/etterna-to-osu-visual-conversion.ts`, `src/conversions/osu-to-etterna/osu-to-etterna-visual-conversion.ts`: shared orchestration of existing scalar functions; full conversion delegates its visual fields and retains its speed path. |
| Source infrastructure | `src/infrastructure/filesystem/native-source-files.ts`, `directory-handle-source-files.ts`, `file-list-source-files.ts`, `source-relative-path.ts`, `registered-asset-loader.ts`: scoped access and identity, with no game policy. |
| Pixel infrastructure | `src/infrastructure/image/shared-image-operations.ts`, `sharp-image-backend.ts`, `wasm-image-backend.ts`, `raster-backend.ts`: one image pipeline over two technical engines. Existing image helpers keep native-compatible wrappers. |
| Output infrastructure | `src/infrastructure/archive/generated-file-set.ts`, `create-skin-archive.ts`: complete output accumulation and ZIP publication; native transactional publishers remain. |
| Etterna adapter | Pure profile/theme parsers, file-index/NoteSkin context, discovery, visual reader, export/settings renderer; existing reader/writers become compatible wrappers over these policies. |
| osu adapter | Pure PNG/judgement/font resolution policy, visual reader and export builder; existing reader/writers remain compatible wrappers. |
| Web entrypoint | `src/web/index.html`, `styles.css`, `main.ts`, `directory-selection.ts`, `conversion-controller.ts`, `conversion-worker.ts`, `conversion-worker-transport.ts`, `web-conversion.ts`, `worker-messages.ts`, `runtime-initialization.ts`: UI, choices, wiring, worker transport, downloads. |
| Automation/evidence | `.ci/web/build-web.ts`, `serve-web.ts`, `capture-image-reference.ts`, `audit-browser-skins.ts`; `tests/browser/`, `tests/integration/browser-*.test.ts`, architecture/build tests, and `.github/workflows/pages.yml`. |

Shared adapters do not import `node:*`, Bun, Sharp, CLI/web, or native wrappers. Introduce tests enforcing the platform-free module graph, beyond the coarse existing layer matrix. Native wrappers preserve existing exports and retain their allowed dependencies. New filesystem users enter the exact architecture allowlist with documented rationale.

## Task 1: Preserve a reference of current behavior

**Files:**
- Modify: `tests/integration/etterna-to-osu.test.ts`, `tests/integration/osu-to-etterna.test.ts` only to extract reusable fixture construction and add uncovered assertions.
- Create: `tests/support/migration-source-fixtures.ts`, `tests/support/image-reference.ts`, `.ci/web/capture-image-reference.ts`, `tests/integration/migration-reference.test.ts`.
- Read: every existing conversion and image unit test, `docs/architecture.md`, `docs/development-standards.md`.

**Interfaces:**
- `createOsuSourceFixture(): Promise<ReadonlyMap<string, Uint8Array>>` creates a complete synthetic 4K skin with `skin.ini` and direction/state-specific images.
- `createEtternaSourceFixture(): Promise<ReadonlyMap<string, Uint8Array>>` creates an installation subtree including NoteSkin, Rebirth settings, profile XML, preferences, judgement config and sheet.
- `decodeReference(image: Uint8Array): Promise<{ readonly width: number; readonly height: number; readonly pixels: Uint8Array }>` decodes with the current native Sharp dependency.
- `createReferenceOsuModel(): SkinModel` in the same fixture module supplies the known complete semantic input used below and by Task 2.
- Fixture maps contain source-relative paths, never absolute personal installation paths. Both integration suites consume the same fixture builders after extraction.

- [ ] Run `bun test tests/integration src/conversions src/infrastructure/image --timeout 15000 --max-concurrency 1` before changes and record the actual counts.
- [ ] Add a characterization test for required speed without changing production code:

```ts
export function createReferenceOsuModel(): SkinModel {
  return {
    game: "osu", metadata: { name: "Reference" }, assets: {}, diagnostics: [],
    playfield: { hitPosition: 432, judgementPosition: 244, comboPosition: 209,
      columnWidth: 68, comboScale: 1, judgementScale: 1, scrollSpeed: 29 },
  }
}
const complete = createReferenceOsuModel()
const incomplete = {
  ...complete, playfield: { ...complete.playfield, scrollSpeed: undefined },
} as unknown as SkinModel
await expect(new OsuToEtternaConversion().convert(incomplete)).rejects.toThrow(/scrollSpeed/)
const converted = await new OsuToEtternaConversion().convert(complete)
expect(converted.playfield).toStrictEqual({ hitPosition: -7, judgementPosition: 4,
  comboPosition: -20, columnWidth: 106, comboScale: 1, judgementScale: 1, scrollSpeed: 902 })
```

- [ ] Extract the existing fixture source strings and image generation mechanically; do not replace the integration tests with mocks. Preserve their installation, rollback, and asset inventory assertions.
- [ ] Capture native image reference outputs before editing any image implementation. Use valid PNG/JPEG inputs with asymmetric colors, alpha gradients and transparent margins. Include frame extraction, rotations of 0/90/180/270/17 degrees, enlargement/reduction, width-only resize/no-op, normalization, bicubic vertical affine, six-frame composition, and receptor hit positions 432/438/439 with widths 46/62/70. Decode reference PNGs to RGBA and record dimensions/pixels under ignored `.tmp/browser-reference/` with a manifest of input SHA-256 and `sharp.versions`.
- [ ] Implement the decoder with the existing engine:

```ts
export async function decodeReference(image: Uint8Array) {
  const { data, info } = await sharp(image).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, pixels: new Uint8Array(data) }
}
```

- [ ] Run the original suites again; fixture extraction must preserve their results. This task characterizes existing behavior, so its initial tests may pass; new production APIs in later tasks must have a failing test first.
- [ ] Commit: `test: capture existing migration and image behavior`.

## Task 2: Share visual conversion without changing full migration

**Files:**
- Create: `src/domain/visual-skin.ts`, `generated-file.ts`; `src/application/ports/visual-skin-reader.ts`, `visual-skin-exporter.ts`; `src/application/conversion/visual-conversion-registry.ts`, `convert-visual-skin.ts` and colocated tests.
- Create: both `*-visual-conversion.ts` files named in the file map and colocated tests.
- Modify: both existing full `*-conversion.ts` classes; the six position functions only to remove runtime-path imports; `src/config/game-defaults.ts` and `src/adapters/osu/writer/write-osu-receptors.ts`.
- Create: `src/conversions/etterna-osu-playfield-reference.ts` containing the existing position baselines; no numeric value changes.

**Interfaces and implementation shape:**

```ts
export type VisualPlayfieldConfiguration = Omit<PlayfieldConfiguration, "scrollSpeed">
export interface VisualSkinModel {
  readonly game: GameId
  readonly metadata: SkinMetadata
  readonly playfield: VisualPlayfieldConfiguration
  readonly assets: SkinAssets
  readonly diagnostics: Diagnostic[]
}
export interface GeneratedFile {
  readonly relativePath: string
  readonly contents: Uint8Array
}
export interface VisualSkinReader {
  readonly game: GameId
  readSkin(reference: SkinReference): Promise<VisualSkinModel>
}
export interface VisualSkinExporter {
  readonly game: GameId
  exportSkin(skin: VisualSkinModel): Promise<readonly GeneratedFile[]>
}
export interface VisualSkinConversion {
  readonly source: GameId
  readonly target: GameId
  convert(source: VisualSkinModel): Promise<VisualSkinModel>
}
```

`VisualConversionRegistry` exposes `constructor(conversions: readonly VisualSkinConversion[])` and `resolve(source: GameId, target: GameId): VisualSkinConversion`, preserving duplicate/missing-route failures analogous to the current registry. `convertVisualSkin(request: { reference: SkinReference; targetGame: GameId }, dependencies: { readers: ReadonlyMap<GameId, VisualSkinReader>; exporters: ReadonlyMap<GameId, VisualSkinExporter>; conversions: VisualConversionRegistry }): Promise<{ files: readonly GeneratedFile[]; diagnostics: Diagnostic[] }>` validates registrations before reading, then reads, converts and exports exactly once.

Each pair module exports one pure field-mapping helper, respectively `convertEtternaVisualPlayfield(source: VisualPlayfieldConfiguration): VisualPlayfieldConfiguration` and `convertOsuVisualPlayfield(source: VisualPlayfieldConfiguration): VisualPlayfieldConfiguration`. These preserve the current field calculations and do not add validation. The full and visual classes both call the helper; each operation retains the validations appropriate to its input contract. In particular, do not route the full Etterna class through a new visual-class validation that changes its prior failure order or acceptance.

- [ ] Write a failing visual-conversion test importing `createReferenceOsuModel` from `tests/support/migration-source-fixtures.ts` and destructuring speed out of its playfield:

```ts
const complete = createReferenceOsuModel()
const { scrollSpeed: _speed, ...visualPlayfield } = complete.playfield
const source: VisualSkinModel = { ...complete, playfield: visualPlayfield }
const result = await new OsuToEtternaVisualConversion().convert(source)
expect(result.playfield).toStrictEqual({ hitPosition: -7, judgementPosition: 4,
  comboPosition: -20, columnWidth: 106, comboScale: 1, judgementScale: 1 })
expect(Object.hasOwn(result.playfield, "scrollSpeed")).toBe(false)
```

- [ ] Run `bun test src/conversions src/application/conversion/convert-visual-skin.test.ts`; expect failure because the new visual types/classes do not exist.
- [ ] Implement the shared field helpers by invoking the existing scalar functions. Construct the visual playfield explicitly so a runtime extra `scrollSpeed` property cannot leak. Preserve shared metadata/assets/diagnostics and source-game errors. Full converters validate exactly as before, call the shared field helper, then add their unchanged `getEtternaCmod`/`getOsuManiaSpeed` result. Native full-class field preservation also retains any source-owned playfield extensions previously preserved by spreading; only the visual operation projects its deliberate subset.
- [ ] Move only the coordinate baseline values `{ etterna: { hitPosition: 0, comboPosition: 0, judgementPosition: 0 }, osu: { hitPosition: 438, comboPosition: 230, judgementPosition: 240 } }` to the pair-owned reference module. Keep `gameDefaults`' public values and installation locations unchanged. The osu writer uses its existing target-owned `438` calibration without importing pair conversions. Do not change formula expressions, rounding order, or constants.
- [ ] Add failing tests for application call order, missing registration, duplicate routes, read/conversion/export failure, and no partial result. Implement coordination with injected ports and preserve causes.
- [ ] Run both direction integration suites, conversion suites, and `bun run test:architecture`; the full reference output and required-speed failure remain unchanged.
- [ ] Commit: `refactor: share visual migration while preserving full conversion`.

## Task 3: Prove browser image equivalence before adapting game readers

**Files:**
- Create: `src/application/ports/asset-loader.ts`, `image-operations.ts`; `src/infrastructure/image/raster-backend.ts`, `shared-image-operations.ts`, `sharp-image-backend.ts`, `wasm-image-backend.ts` and their contract tests.
- Modify: current image helper modules to retain native-compatible wrappers over the shared pipeline; no game policy moves into the engine.
- Create: `.ci/web/serve-web.ts`, `tests/browser/image-backend.e2e.ts`, `tests/browser/playwright.config.ts`, `tests/browser/image-backend.html`, `tests/browser/image-backend-entry.ts`.
- Modify: `package.json`, `bun.lock`, architecture's exact filesystem allowlist and documentation when native file loading moves to a new file.

**Interfaces:**
- `AssetLoader.read(assetId: string): Promise<Uint8Array>` resolves source and bundled-template identities.
- `createImageOperations(loader: AssetLoader, backend: RasterBackend): ImageOperations` builds one shared implementation of the existing frame/rotation/normalization/trim/composition sequence.
- `createSharpImageBackend(): RasterBackend`, `createWasmImageBackend(module: VipsModule): RasterBackend` use the same backend interface. `VipsModule` is the awaited return type of the dependency factory; first-party annotations never use `any`.
- `initializeBrowserVips(assetDirectory: URL): Promise<VipsModule>` loads local package resources, sets concurrency to one, bounds caches, and fails contextually if isolation or resource loading is unavailable.
- Move the existing `RenderReceptorOptions`, `ImageDimensions`, `ExactImageSize`, `JudgementImageVariants`, and frame types to `src/application/ports/image-operations.ts` and re-export them from their current native modules. Preserve every field's existing type; this is type relocation, not a redesigned option object. All other backend types below belong in `src/infrastructure/image/raster-backend.ts`.

```ts
export interface RgbaImage {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8Array
}
export interface RasterRectangle {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}
export interface RasterResize {
  readonly width?: number
  readonly height?: number
  readonly fit: "fill" | "inside"
  readonly withoutEnlargement: boolean
  readonly kernel: "lanczos3"
}
export interface RasterOverlay {
  readonly image: Uint8Array
  readonly left: number
  readonly top: number
}
export interface RasterBackend {
  dimensions(image: Uint8Array): Promise<ImageDimensions>
  ensureAlpha(image: Uint8Array): Promise<Uint8Array>
  extract(image: Uint8Array, rectangle: RasterRectangle): Promise<Uint8Array>
  rotate(image: Uint8Array, angle: number): Promise<Uint8Array>
  resize(image: Uint8Array, options: RasterResize): Promise<Uint8Array>
  affineVertical(image: Uint8Array, scale: number): Promise<Uint8Array>
  decodeRgba(image: Uint8Array): Promise<RgbaImage>
  compose(width: number, height: number, overlays: readonly RasterOverlay[]): Promise<Uint8Array>
  dispose(): Promise<void>
}
export interface ImageOperations {
  dimensions(image: Uint8Array): Promise<ImageDimensions>
  extractFrame(asset: Pick<ImageAsset, "filePath" | "frame">): Promise<Uint8Array>
  renderNote(asset: ImageAsset): Promise<Uint8Array>
  renderReceptor(asset: ImageAsset, options: RenderReceptorOptions): Promise<Uint8Array>
  renderJudgementVariants(asset: ImageAsset, density: 1 | 2, scale: number): Promise<JudgementImageVariants>
  resizeProportionally(image: Uint8Array, scale: number): Promise<Uint8Array>
  resizeToWidth(image: Uint8Array, width: number): Promise<Uint8Array>
  resizeExact(image: Uint8Array, size: ExactImageSize): Promise<Uint8Array>
  normalizeReceptor(image: Uint8Array, size: ImageDimensions): Promise<Uint8Array>
  isTransparent(image: Uint8Array): Promise<boolean>
  composeVerticalSheet(frames: readonly CenteredSpriteSheetFrame[]): Promise<Uint8Array>
}
```

`rotate` preserves the current Sharp rotation/default background; `affineVertical` preserves bicubic interpolation and transparent background; `compose` uses transparent RGBA and the current overlay blend semantics. Shared orchestration owns trimming scans, frame calculations, resizing geometry and call order. The backend owns decoding/interpolation/premultiplication/encoding, without game names or calibrated constants. `RasterBackend` has no game-specific function.

- [ ] Write the cross-engine failing test before introducing the browser backend. Run each operation on the Task 1 references and compare decoded RGBA, not encoded hashes:

```ts
const expected = await decodeReference(nativeOutput)
const actual = await decodeReference(browserOutput)
expect(actual.width).toBe(expected.width)
expect(actual.height).toBe(expected.height)
expect(actual.pixels).toEqual(expected.pixels)
```

`nativeOutput` comes from the captured unchanged helper; `browserOutput` comes from the same operation/case run in the browser harness. Transport arrays through the local test page; do not load personal skins into CI.

- [ ] Configure Playwright with `testMatch: "**/*.e2e.ts"`. Bun's normal suite must not discover Playwright specs; verify this with `bun test` after adding the harness. Run `bunx --bun --no-install playwright test -c tests/browser/playwright.config.ts tests/browser/image-backend.e2e.ts`; first expect the absent backend/fixture harness to fail.
- [ ] Install only the exact four new dependency versions in the header, preserving Bun's lockfile discipline. Capture `wasm-vips/versions` alongside native `sharp.versions`; `wasm-vips@0.0.18` currently declares libvips `8.18.3`, matching the installed reference. A later lockfile change requires rerunning equivalence; matching version numbers alone do not prove pixels.
- [ ] Use libvips' buffer APIs, extraction, alpha handling, Lanczos3 resizing, bicubic affine and composition to implement `RasterBackend`. Match Sharp's handling of premultiplied alpha, sRGB/ICC conversion, arbitrary rotation background, shrink/enlarge rounding, no-op width resize and cast-to-uchar. Consult the pinned Sharp `pipeline.cc` and `operations.cc` for engine mechanics; do not replace business geometry or merely pick an approximately similar filter. Dispose every WASM image/interpolator in `finally`, copy returned byte views before deletion, and retain no source cache after reset.

```ts
const input = vips.Image.newFromBuffer(encoded, "", { fail_on: "warning" })
try {
  return { width: input.width, height: input.height }
} finally {
  input.delete()
}
```

- [ ] Implement the exact backend interface above. Copy the current image orchestration into `shared-image-operations.ts` mechanically and run the same sequence through native and WASM primitives. Keep every existing native exported signature and contextual error via wrappers. `extractFrame` returns source bytes directly without re-encoding when no frame is selected; the existing native wrapper still returns its original path in that case.
- [ ] Serve the pinned isolation worker as its own same-origin file above the page, not inside a bundle or from a CDN. Test a clean first visit without server COOP/COEP headers, one bounded initialization reload before selection, a warm visit, and a failed worker/WASM request. Initialization failure disables conversion with a visible recovery message; do not retry indefinitely or degrade to different pixels. Only the worker's non-personal reload marker may use sessionStorage; it never stores handles, source bytes, profile names or diagnostics and does not cache selected files.
- [ ] Enforce browser asset limits before decoding/rendering and output limits during accumulation. Native wrappers retain their existing limits and failures. Use a bounded browser work queue rather than running all decoders concurrently; all accepted work settles before an error escapes.
- [ ] Run all current native image tests and browser equivalence, including partial alpha, JPEG input and ICC profiles. If any reference differs, fix the technical backend before continuing. Do not relax the comparison or modify the native reference to make it pass.
- [ ] Commit: `feat: add equivalent browser image processing backend`.

## Task 4: Provide scoped file sources for each input mechanism

**Files:**
- Create: `src/application/ports/source-files.ts`; five source-infrastructure files in the file map, with colocated tests.
- Create: `tests/support/map-source-files.ts` for deterministic adapter tests.
- Modify: exact filesystem allowlist and `docs/development-standards.md` for the new native wrapper.

**Interfaces:**

```ts
export interface SourceEntry {
  readonly name: string
  readonly kind: "file" | "directory"
}
export interface SourceFiles {
  list(relativeDirectory: string): Promise<readonly SourceEntry[]>
  readBytes(relativePath: string): Promise<Uint8Array>
  assetId(relativePath: string): string
  ownsAsset(assetId: string): boolean
  readAsset(assetId: string): Promise<Uint8Array>
}
export class SourceFileNotFoundError extends Error {}
```

`createNativeSourceFiles(root: string): SourceFiles` binds to a validated absolute root and preserves realpath containment. `createDirectoryHandleSourceFiles(root: ReadableDirectoryHandle): SourceFiles` uses a minimal structural handle type exposing `entries()`, `getDirectoryHandle(name)`, and `getFileHandle(name).getFile()`. `createFileListSourceFiles(files: readonly DirectoryFile[]): SourceFiles` consumes `{ readonly webkitRelativePath: string; arrayBuffer(): Promise<ArrayBuffer> }` and strips one common selected-root segment. `createMapSourceFiles(files: ReadonlyMap<string, Uint8Array>): SourceFiles` is the test implementation. Text decoding is an exported `readSourceText(source: SourceFiles, relativePath: string): Promise<string>` using `TextDecoder` with the existing encoding semantics.

`createRegisteredAssetLoader(): AssetLoader & { register(source: SourceFiles): void; clear(): void }` exposes the registered loader. Each source keeps a map of issued IDs to relative paths; `assetId` records the identity, `ownsAsset` tests only that map, and `readAsset` resolves only an issued identity. Native IDs preserve current validated absolute paths; browser IDs distinguish sources/templates without exposing absolute system paths. The loader dispatches to exactly one owning registered source and rejects unknown/ambiguous IDs, never arbitrary filesystem reads.

- [ ] Write a failing input-list test using structural files without needing a DOM:

```ts
let unrelatedReads = 0
const source = createFileListSourceFiles([
  { webkitRelativePath: "Etterna/Save/Preferences.ini",
    arrayBuffer: async () => new TextEncoder().encode("[Options]\nTheme=Rebirth").buffer },
  { webkitRelativePath: "Etterna/Songs/large.ogg", arrayBuffer: async () => {
    unrelatedReads += 1; return new ArrayBuffer(0)
  } },
])
expect(await readSourceText(source, "Save/Preferences.ini")).toContain("Theme=Rebirth")
expect(unrelatedReads).toBe(0)
await expect(source.readBytes("../outside.ini")).rejects.toThrow(/traversal|outside/)
```

- [ ] Run `bun test src/infrastructure/filesystem/*source-files.test.ts`; expect the new factories to be missing.
- [ ] Implement lazy handle traversal and a file-list metadata index. `list` reads metadata only; `readBytes` touches exactly the selected file. Do not emulate recursive Node filesystem APIs. Validate root-relative segments, reject mixed input roots/traversal/absolute drive or UNC paths, and retain exact-case names for game adapters to resolve case-insensitive matches themselves.
- [ ] Add shared contract tests for nested paths/spaces/non-ASCII names, genuine missing files, same-name file versus directory, ambiguous casing, read failure, root-prefix stripping, and rejecting a source ID from another registered root. Add a native test rejecting a link escaping its real root. Do not convert permission/read errors into `SourceFileNotFoundError`.
- [ ] Run these contract tests for map, native, and handle implementations; exercise the real file-input backend in the browser suite. Native `node:fs` fallbacks remain limited to directories, metadata, real paths and other already-allowed operations.
- [ ] Commit: `refactor: introduce scoped source file access`.

## Task 5: Share game discovery and reading policies

**Files:**
- Create Etterna pure modules: `profile/etterna-playfield-configuration.ts`, `profile/etterna-cmod.ts`, `profile/etterna-profile-guid.ts`, `theme/etterna-theme.ts`, `assets/etterna-judgement-selection.ts`, `noteskin/skin-file-index.ts`, `noteskin/create-note-skin-context.ts`, `catalog/discover-etterna-sources.ts`, `reader/read-etterna-visual-skin.ts` under `src/adapters/etterna/`.
- Create osu pure modules: `assets/osu-png-asset-policy.ts`, `judgements/osu-judgement-asset-policy.ts`, `fonts/osu-combo-scale.ts`, `reader/read-osu-visual-skin.ts` under `src/adapters/osu/`.
- Modify the current corresponding native readers/resolvers/catalogs, NoteSkin context and analyzers to use or re-export shared policies; retain their existing exported APIs, diagnostics and wrapper error context.
- Modify `src/adapters/etterna/judgements/analyze-etterna-judgement-sheet.ts` to delegate format/layout analysis with injected dimensions, retaining its native convenience export.
- Test: colocated parser/source tests and `tests/integration/browser-source-parity.test.ts`.

**Interfaces:**
- `discoverEtternaSources(source: SourceFiles): Promise<{ skins: readonly { name: string; relativePath: string }[]; profiles: readonly { id: string; displayName: string }[]; theme: string; diagnostics: Diagnostic[] }>` enumerates `NoteSkins/dance`, `Save/LocalProfiles`, and relevant settings only.
- `readEtternaVisualSkin(source: SourceFiles, selection: { skinPath: string; profileId?: string; theme: string; useDefaultSettings: boolean }, images: ImageOperations): Promise<VisualSkinModel>` uses the shared static analyzers and approved explicit default input.
- `readOsuVisualSkin(source: SourceFiles, selection: { skinName: string; useDoubleResolutionAssets: boolean }, images: ImageOperations): Promise<VisualSkinModel>` performs the existing unique-4K, asset, judgement and font policy, without reading a CFG.
- Pure extraction functions retain the current signatures: `extractEtternaPlayfieldConfiguration(ast)`, `extractEtternaCmod(source, profilePath)`, `extractEtternaProfileGuid(source, profilePath)`, `extractEtternaTheme(source, preferencesPath)`. Native modules re-export these names so current imports remain valid.

- [ ] Write failing parity tests using the Task 1 fixtures and Task 4 map source. Compare all semantic properties and diagnostics, and compare image identities after mapping the native absolute paths to fixture-relative paths. Reverse expectations explicitly exclude speed:

```ts
const files = await createOsuSourceFixture()
const source = createMapSourceFiles(files)
const loader = createRegisteredAssetLoader()
loader.register(source)
const images = createImageOperations(loader, createSharpImageBackend())
const visual = await readOsuVisualSkin(source,
  { skinName: "Fixture", useDoubleResolutionAssets: false }, images)
expect(visual.game).toBe("osu")
expect(Object.hasOwn(visual.playfield, "scrollSpeed")).toBe(false)
```

The same fixture is also run through the Task 3 browser backend. Shared adapter code imports only the ImageOperations contract, never either backend factory.

- [ ] Run `bun test tests/integration/browser-source-parity.test.ts`; expect missing shared readers to fail.
- [ ] Extract existing parser/index/resolution algorithms into the listed platform-free modules and supply `SourceFiles`/image ports. Keep AST ranges, Lua encoding modes, ordered repeated INI semantics, redirect detection, frame selection, rotation and judgement-grade policies identical. Update analyzer imports so values come from the shared context module, not an eagerly importing native wrapper.
- [ ] Implement browser input preparation separately from strict format parsing. Missing profile/settings/theme configuration triggers the explicitly reviewed default choice and diagnostic. A present malformed configuration fails. Read available CMod through the same extractor; missing CMod requests visual migration, whereas an invalid CMod remains an error. No speed is read in the reverse reader.
- [ ] Add the explicit-HD regression using the fixture's real referenced note path from its `skin.ini`: set that reference to its `@2x` form, leave only the SD asset, and assert `OsuPngAssetNotFoundError` even when the review chose SD. Add missing implicit lane HD fallback, missing combo digit versus invalid image, mixed judgement density, missing/duplicate 4K, escaped paths and non-executed malicious Lua cases.
- [ ] Add failures for permission denied/malformed `playerConfig.lua`, malformed `assetsConfig.lua`, invalid XML, missing GUID and invalid image bytes; only typed genuine absence activates input defaults. Assert Etterna discovery never lists `Songs` and never calls its byte loader.
- [ ] Rewire native readers/catalogs to use the shared policies while preserving their full-model speed, exact public shape and error wrapping. Run both original integrations plus every modified adapter test, architecture tests, and applicable real-skin audits under `tmp`.
- [ ] Commit: `refactor: share game source policies across entrypoints`.

## Task 6: Share target output policies and publish complete file sets

**Files:**
- Create: `src/application/ports/generated-files.ts`; `src/infrastructure/archive/generated-file-set.ts`, `create-skin-archive.ts` with colocated tests.
- Create: `src/adapters/osu/writer/build-osu-skin-files.ts`; `src/adapters/etterna/writer/build-etterna-visual-files.ts`; `src/adapters/etterna/templates/render-etterna-visual-settings.ts`; `src/adapters/osu/templates/osu-template-content.ts`; `src/adapters/etterna/writer/etterna-installation-guide.ts`, `src/adapters/osu/writer/osu-installation-guide.ts`.
- Modify: existing osu/Etterna writers, asset preparation functions, judgement writer, template renderers and finalizers to delegate to shared policies with supplied I/O/image dependencies. Retain native installation/profile transaction boundaries.
- Test: `tests/integration/browser-export-parity.test.ts` and original integrations.

**Interfaces:**
- `GeneratedFiles.write(relativePath: string, contents: Uint8Array): Promise<void>`, `readBytes(relativePath: string): Promise<Uint8Array>`, `remove(relativePath: string): Promise<void>` supplies only operations required by target assembly.
- `createGeneratedFileSet(maxBytes: number): GeneratedFiles & { snapshot(): readonly GeneratedFile[]; clear(): void }` owns a private map, counts replacement/removal sizes accurately and rejects unsafe/duplicate ambiguous names.
- `buildOsuSkinFiles(skin: VisualSkinModel, dependencies: { templates: SourceFiles; images: ImageOperations; output: GeneratedFiles }): Promise<void>` assembles the existing complete target template and rendered inventory.
- `buildEtternaVisualFiles(skin: VisualSkinModel, dependencies: { templates: SourceFiles; images: ImageOperations; output: GeneratedFiles }): Promise<void>` prepares NoteSkin, judgement and visual settings using the same native asset/grade rules, with no target profile allocation or speed serialization.
- `createSkinArchive(files: readonly GeneratedFile[]): Promise<Uint8Array>` ZIPs a complete snapshot using local fflate; generated paths are revalidated at this boundary.
- `renderEtternaVisualSettings(skin: VisualSkinModel, template: string): string` renders existing gameplay keys without invoking the XML/CMod renderer.

- [ ] Write a failing reverse-export assertion:

```ts
const files = await exporter.exportSkin(convertedVisual)
expect(files.some((file) => file.relativePath.endsWith("Etterna.xml"))).toBe(false)
const settings = files.find((file) => file.relativePath === "profile-settings/playerConfig.lua")
expect(settings).toBeDefined()
const guide = files.find((file) => file.relativePath === "INSTALLATION.md")
expect(guide && new TextDecoder().decode(guide.contents)).toContain("https://cmodcalc.com/")
```

`exporter` is a `VisualSkinExporter` binding the Etterna builder to registered templates and the image backend; `convertedVisual` is the output of the shared visual conversion for Task 1's osu fixture.

- [ ] Run `bun test tests/integration/browser-export-parity.test.ts`; expect absent exporter/builders to fail.
- [ ] Separate rendering/asset decisions from native write/mkdir/path calls. Reuse the same single asset preparation functions for both outputs; native wrappers still copy byte-identical templates and publish through existing transactions. Expose target template manifests from the owning adapters, not runtime config initialization.
- [ ] Build forward images, both judgement densities, combo images and fixed long-note assets; remove only the existing allowlisted template internals after every sibling settles. Build reverse notes at width 150, receptors at width 146 and note-derived ratios, six ordered judgement rows with existing density names, and visual `playerConfig.lua`.
- [ ] Implement `GeneratedFiles` with a map and exact byte accounting. Create the download only from its settled final snapshot. Test write replacement, remove, unsafe paths, 256 MiB limit, a sibling failing late, and a synchronous callback throw while another sibling is pending. No partially successful export returns files.
- [ ] Render the guides with the exact approved output paths. Reverse explains backing up/applying visual keys to existing Rebirth-compatible theme settings, choosing the judgement, preserving personal speed modifiers and using the calculator with receptor size. Forward explains skin extraction plus optional manually converted ManiaSpeed; do not serialize a full destination CFG. Neither includes absolute personal source paths.
- [ ] Compare native target inventories, parsed settings and decoded images to browser target files for the same fixtures. Reverse comparison intentionally excludes native `Etterna.xml`, profile identity and assets config installation effects, but visual values and artwork are equal. Extract and inspect both ZIPs with `unzipSync` in tests.
- [ ] Run both original integrations and native writer tests. If shared writer changes affect release assembly/resources, run the documented Windows distribution verification as well.
- [ ] Commit: `refactor: share target rendering and add complete archive export`.

## Task 7: Wire browser requests through shared application operations

**Files:**
- Create: `src/web/web-conversion.ts`, `worker-messages.ts`, `conversion-worker.ts`, `conversion-worker-transport.ts` and colocated tests.
- Modify: architecture matrix for `web`, graph checks, `tsconfig.json` only as required for DOM typing.
- Create: `tests/architecture/browser-dependencies.test.ts`, `tests/integration/browser-conversion.test.ts`.

**Interfaces:**
- `WebConversionRequest` is a discriminated union: `{ direction: "etterna-to-osu"; source: BrowserSource; skinPath: string; profileId?: string; theme: string; useDefaultSettings: boolean }` or `{ direction: "osu-to-etterna"; source: BrowserSource; skinName: string; useDoubleResolutionAssets: boolean }`.
- `BrowserSource` is `{ kind: "directory-handle"; handle: ReadableDirectoryHandle } | { kind: "file-list"; files: readonly File[] }`, with only structured-clone-compatible properties.
- `runWebConversion(request: WebConversionRequest, onProgress: (progress: ConversionProgress) => void): Promise<WebConversionResult>` builds registered stores/ports and uses the shared application operation. `ConversionProgress` is `{ phase: "reading" | "converting" | "rendering" | "archiving"; completed: number; total: number }`; `WebConversionResult` is `{ archive: Uint8Array; filename: string; diagnostics: readonly Diagnostic[]; convertedManiaSpeed?: number }`.
- `WorkerCommand` is `{ kind: "convert"; requestId: number; request: WebConversionRequest } | { kind: "dispose"; requestId: number }`; `WorkerReply` is a tagged union of `{ kind: "progress"; requestId; progress: ConversionProgress }`, `{ kind: "success"; requestId; result: WebConversionResult }`, `{ kind: "failure"; requestId; message: string }`, and `{ kind: "disposed"; requestId }`, with `requestId: number` in each variant. Failure has an English actionable message; it must not serialize unrelated absolute paths or raw credentials.
- `ConversionWorkerTransport` exposes `postMessage(command: WorkerCommand): void`, `subscribe(listener: (reply: WorkerReply) => void): () => void`, and `dispose(): Promise<void>`. `createConversionWorkerTransport(worker: Worker): ConversionWorkerTransport` owns actual Worker events, message validation, source cloning, output transfer and disposal acknowledgment. Controllers depend on this small interface, allowing safe typed fakes rather than asserting that a partial object is a full DOM Worker.

- [ ] Write a failing reverse route test using the map fixtures and injected shared ports; assert no source read ends with `.cfg`, no output contains `Etterna.xml` or a CMod, and reverse progress ends with a complete archive.
- [ ] Run `bun test tests/integration/browser-conversion.test.ts`; expect the new wiring to be absent.
- [ ] Implement web composition with the registered factories from Tasks 2-6. The forward route uses the full converter only when actual valid CMod is available; otherwise call the visual operation. The reverse uses the visual operation. No entrypoint reimplements parsing, formulas, density/fallback rules or output dimensions.
- [ ] Run conversion in a dedicated browser worker so pixel/ZIP work does not freeze controls. Clone source handles/Files into the worker; pass output bytes using a transfer list only after completion. Do not detach a cached source image buffer that another operation needs. Catch worker initialization/exit and application failures into tagged replies, without logging and continuing.
- [ ] Add dependency tests rejecting web-to-CLI, CLI-to-web, core-to-entrypoint, Node/Bun/Sharp in the web transitive graph, and native convenience wrappers imported by a pure adapter. Test violation detection with small synthetic graphs, not merely a hardcoded passing inventory.
- [ ] Run both original integration suites, new browser conversion integration and architecture tests.
- [ ] Commit: `feat: compose browser migration through the shared core`.

## Task 8: Build the accessible directory-to-download page

**Files:**
- Create remaining `src/web` HTML/CSS/UI files in the file map and their controller tests.
- Create: `.ci/web/build-web.ts`, `tests/browser/converter.e2e.ts`, `tests/browser/fixture-directory.ts`, `tests/distribution/web-build.test.ts`.
- Modify: `package.json` for `build:web`, `dev:web`, `test:browser`; `.gitignore` for generated output; quality commands to include first-party web code.

**Interfaces:**
- `selectDirectory(): Promise<BrowserSource | undefined>` performs only user-triggered read selection, with the file-input fallback and cancellation returning undefined.
- `initializeBrowserRuntime(): Promise<void>` establishes isolation/loads required resources before enabling the source button; failures remain visible and do not loop.
- `createConversionController(dependencies: { selectDirectory: typeof selectDirectory; createWorker: () => ConversionWorkerTransport; download: (result: WebConversionResult) => void }): ConversionController` owns monotonically increasing requestIds, selection state and cleanup. `ConversionController` exposes `selectSource(): Promise<void>`, `setDirection(direction: WebConversionRequest["direction"]): Promise<void>`, `convert(request: WebConversionRequest): Promise<void>`, `reset(): Promise<void>`, `dispose(): Promise<void>`, and `subscribe(listener: (state: ConversionState) => void): () => void`. `ConversionState` is a discriminated union of the six UI phases listed below, with review selections, progress, result or failure message only on the phases where they are available.
- `buildWeb(): Promise<{ directory: string; files: readonly string[] }>` creates the ignored `build/web` static artifact using `Bun.build({ target: "browser" })`, copies local WASM/worker/licence/template resources, and writes a template manifest.

- [ ] Add a failing controller test: start request 1, reset/change direction, start request 2, then deliver success for request 1. Assert no stale download appears and only request 2 can finish. Also assert cancelling the directory dialog keeps existing valid selection. A typed delayed-transport test setup is:

```ts
let reply: ((message: WorkerReply) => void) | undefined
let lastCommand: WorkerCommand | undefined
const transport: ConversionWorkerTransport = {
  postMessage(command) { lastCommand = command },
  subscribe(listener) { reply = listener; return () => {} },
  async dispose() {},
}
const downloads: WebConversionResult[] = []
const controller = createConversionController({
  selectDirectory: async () => undefined,
  createWorker: () => transport,
  download: (result) => { downloads.push(result) },
})
// Keep the listener to simulate a message already queued before disposal.
const oldReply = reply
await controller.reset()
oldReply?.({ kind: "success", requestId: 1, result: {
  archive: new Uint8Array([1]), filename: "stale.zip", diagnostics: [],
} })
expect(downloads).toHaveLength(0)
```

Use the Task 1 generated osu source as actual Files to start the conversion before capturing `oldReply` and `lastCommand`; assert the captured convert command's real requestId rather than assuming it is 1. The fixture-directory module produces Files with `Object.defineProperty(file, "webkitRelativePath", { value: "Fixture/" + relativePath })`; the bytes and name come directly from the fixture map. Add the second request and its eventual result to prove that reset preserves the next conversion, not merely that disposal drops all events.
- [ ] Run the controller and `tests/distribution/web-build.test.ts` tests; expect the missing controller/build functions to fail.
- [ ] Implement UI phases `initializing`, `selecting`, `review`, `converting`, `success`, and `error`. Their `ConversionState` variants have, respectively, no source; an optional existing selection; `{ source: BrowserSource; request: WebConversionRequest; diagnostics: readonly Diagnostic[] }`; `{ requestId: number; progress: ConversionProgress }`; `{ result: WebConversionResult }`; and `{ message: string; recoverable: boolean }`. Display the source game's exact directory label, Etterna skin/profile choices, explicit SD/HD selection for osu, imported/default settings, diagnostics, progress and ZIP download. Keep reverse scroll speed marked manual and show the calculator link in review and result.
- [ ] Use a compact responsive dark interface suited to rhythm-game artwork, visible labels/focus states, live status, sufficient contrast, keyboard operation, and readable errors. Use CSS and the existing licensed project banner if useful; do not add unlicensed imagery, remote fonts, analytics or unrelated product features.

```html
<a href="https://cmodcalc.com/" target="_blank" rel="noopener noreferrer">
  Convert scroll speed with CMod Calculator
</a>
<p id="conversion-status" role="status" aria-live="polite"></p>
```

- [ ] Bundle the main page and conversion worker separately. Copy Emscripten resources and the isolation service worker intact to same-origin paths; never bundle the service worker into main code. Every URL derives from a relative module/document URL, never origin-root `/assets`. Include GPL/template/dependency notices. Do not include native binaries or unused WASM image codecs beyond the formats the current converter supports.
- [ ] Disable conversion until runtime initialization and review validation succeed. A reset immediately invalidates replies and revokes download URLs, then requests disposal. The worker settles accepted image work, discards incomplete output, calls backend disposal to stop WASM threads/caches, clears source/handle references, and acknowledges disposal before termination. Initialize a fresh worker before another conversion. Surface a worker that fails to acknowledge disposal rather than silently continuing with an orphan operation. Do not persist source selections or diagnostics.
- [ ] Add real-browser tests for both directions using synthetic disk fixtures: automate file-input directory selection with `setInputFiles`, intercept `showDirectoryPicker` only for the handle-contract path, and record an actual native-dialog manual smoke check where automation cannot operate it. Await a real download, extract its ZIP, and assert files/configuration/pixels.
- [ ] Exercise missing settings, malformed Lua, invalid image bytes, mixed case paths, an explicit missing HD asset, cancelled selection, repeated/reset conversion, worker failure and unsupported directory APIs. Assert no network request carries source/profile data and no source filesystem hash changes.
- [ ] Test fresh isolation at `/vsrg-skin-converter/`, delayed/failed WASM, a stale service worker update, warm reload and normal browsing without special dev-server headers. No folder may be selected before a potential initialization reload.
- [ ] Run `bun run build:web`, `bun run test:browser`, both native integrations and the architecture gate.
- [ ] Commit: `feat(web): add browser directory conversion interface`.

## Task 9: Publish with complete evidence and canonical documentation

**Files:**
- Create: `.github/workflows/pages.yml`, `.ci/web/audit-browser-skins.ts`, `tests/repository/pages-workflow.test.ts`, `.changeset/browser-converter.md`.
- Modify: `readme.md`, `CONTRIBUTING.md`, `docs/architecture.md`, `docs/development-standards.md`, `SECURITY.md` where browser trust boundaries expand its stated scope; preserve AGENTS.md as its concise index.
- Modify: package quality commands and existing CI only as needed to run the additional browser/build checks without weakening Windows quality/release.

**Interfaces:**
- `auditBrowserSkins(root: string): Promise<{ checked: number; failures: readonly string[] }>` compares both backends against supported real cases under ignored `tmp`, writes sanitized local evidence, and fails when any required case differs. It must distinguish an existing unsupported case from a new regression and never check the corpus into Git.
- Workflow builds/tests Pages artifacts on PRs and deploys tested output only on `main`. Output is the actual `deploy-pages` URL.

- [ ] Write a failing workflow policy test verifying a repository-subpath-safe build, separate build/deploy jobs, protected `github-pages` environment, full SHA pins, no privileged PR deployment, and `pages: write`/`id-token: write` only on the deployment job. Use the repository's existing workflow-test style to validate the actual YAML content.
- [ ] Run `bun test tests/repository/pages-workflow.test.ts`; expect the missing workflow to fail.
- [ ] Resolve the current official action commit SHAs at implementation time. Preserve existing checkout/setup-Bun pins when reusing them; pin configure/upload/deploy Pages actions by actual resolved full SHAs with version comments. Build runs `bun ci`, shared/native quality, browser contract/e2e checks and `bun run build:web`; upload only `build/web`. Deployment requires the build artifact, the protected environment, and `main`, including manual runs.
- [ ] Update canonical documents with actual source ownership, ports, visual/full operations, dependency rules, browser setup/use, optional defaults, SD/HD selection, reverse speed omission, calculator, installation instructions, browser limits, privacy and service-worker initialization. Do not claim portable support beyond the existing Windows build or publish an unverified URL.
- [ ] Add the release intent:

```md
---
"vsrg-skin-converter": minor
---

Add a GitHub Pages browser converter with directory inputs and downloadable
Etterna/osu!mania skins, reusing existing migration rules. The web reverse route
exports visual settings and links to CMod Calculator for manual speed setup.
```

- [ ] Run `bun run check`, `git diff --check`, `bun run build:web`, and `bun run test:browser`. Run both original integrations and `.ci/web/audit-browser-skins.ts` for the applicable corpus. Because native reader/writer/image implementations were modularized, verify the Windows portable bundle using `bun run build:windows`, `bun run test:distribution`, and `bun run release:windows` as required by the standards; inspect the final manifest/checksum and ensure web-only dependencies do not enter the portable runtime closure.
- [ ] Commit: `feat(web): publish the browser converter with GitHub Pages`.
- [ ] Perform whole-branch review before integration, focusing on business-rule preservation, native transaction guarantees, no duplicate policies, browser dependency graph, pixel evidence, input boundaries and deployment permissions. Fix findings and rerun only affected checks plus required full completion checks.
- [ ] Publish through the repository's authorized workflow. Verify Pages uses GitHub Actions and confirm actual deployment success/URL. If protected-branch review or missing GitHub privileges prevents deployment, leave the concrete tested branch/PR ready and report the precise required action rather than bypassing protection.
- [ ] Open the actual deployed URL and complete a generated-fixture conversion under the repository path, then verify the downloaded ZIP. Report tested behavior, skipped/manual browser evidence, any unsupported cases, and the final deployment state accurately.

## Self-review and execution handoff

Coverage: Tasks 1-3 protect shared semantic/image behavior; Task 4 supplies both directory inputs; Task 5 shares parsing/discovery and approved input defaults; Task 6 shares output and safe ZIPs; Task 7 provides multiple entrypoints through shared operations; Task 8 delivers the complete accessible browser flow; Task 9 covers public hosting, canonical contracts, corpus/portable verification, licensing and release intent.

The plan adds no server, new migration formula, new format fallback, fabricated CMod, or optional speed to the existing full model. A technical image mismatch blocks downstream work until fixed; it is not grounds for weakening business behavior.

Recommended execution: native execution in this chat. The tasks depend closely on shared interfaces, and one implementer can keep these extractions coherent while the reference/parity tests protect behavior. A fresh whole-branch reviewer checks the finished implementation. Subagent-driven execution remains available if the user prefers independent implementation/review at each task boundary.

Implementation begins after the user reviews this plan and selects an execution method. At execution start, invoke the chosen skill and `using-git-worktrees`, inspect existing attachments/current Git state, and reuse a suitable isolated checkout if available. The feature branch already contains the approved spec; preserve those commits when selecting the implementation ref.

## Technical references checked during planning

- [wasm-vips browser initialization and isolation](https://github.com/kleisauke/wasm-vips/blob/master/README.md)
- [Pinned WASM library versions](https://cdn.jsdelivr.net/npm/wasm-vips@0.0.18/versions.json)
- [Isolation service worker for GitHub Pages](https://github.com/gzuidhof/coi-serviceworker/blob/master/README.md)
- [Sharp 0.35.3 image pipeline](https://github.com/lovell/sharp/blob/v0.35.3/src/pipeline.cc)
- [GitHub Pages custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
