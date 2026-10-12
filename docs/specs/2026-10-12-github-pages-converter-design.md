# Browser Skin Converter on GitHub Pages

Date: 2026-10-12
Status: Approved on 2026-10-12; implemented with shared CLI/browser policies, verification and deployment workflow

## Intent and agreed scope

Make the existing 4K Etterna and osu!mania conversion available to anyone through a
public GitHub Pages website, with no converter installation, account, backend, or
upload of source files. Conversion runs on the visitor's computer in the browser.

The user selected browser conversion and refined the input flows:

- Etterna to osu!mania: select the Etterna installation directory, then select a
  NoteSkin and local profile discovered inside it.
- osu!mania to Etterna: select only the source skin directory. Do not request the
  osu! installation, user CFG, or target Etterna installation. Do not migrate
  scroll speed; link to https://cmodcalc.com/ for manual conversion.
- Preserve supported artwork and visual gameplay settings. When a configuration
  file is absent, use documented defaults and report their use before conversion.
- Preserve every existing migration business rule. Modularize the implementation
  so multiple entrypoints use the same migration core and format policies.

The scroll-speed exclusion is interpreted as specific to osu!mania to Etterna.
Etterna to osu!mania retains speed conversion when the selected profile supplies
a valid CMod; its result is installation guidance rather than a local CFG edit.

This document defines the proposed implementation. Product code, dependencies,
GitHub repository settings, and deployment have not been changed at this stage.

The implementation tasks are recorded in
[the implementation plan](../plans/2026-10-12-github-pages-converter.md).

## User experience

One responsive page contains a direction selector, a source-directory button,
direction-specific selections, a concise review, conversion progress, diagnostics,
and a download button. Controls have visible labels, keyboard access, and an
accessible status region. Conversion begins only after an explicit button click.
Technical names and diagnostics follow the project's English-language standard.

### Etterna to osu!mania

1. Select the installation root containing `NoteSkins/dance` and `Save`.
2. Discover supported NoteSkins; show their names and require a selection.
3. Discover local profiles in `Save/LocalProfiles`. Select the only available
   profile automatically; show a choice when there are several. Offer a clearly
   labeled default-settings choice when no usable profile files are available.
4. Resolve the active theme from `Save/Preferences.ini`, the selected profile's
   theme settings and GUID, and its judgement selection in the theme's asset
   configuration. Use the corresponding judgement image from `Assets/Judgments`.
5. Show the selected skin/profile, imported settings, and any defaults. Read the
   selected profile's CMod when available, using the existing conversion formula.
6. Download the complete osu! skin and an installation guide. The guide explains
   where to place the skin and, when available, the converted `ManiaSpeed` value
   to apply manually. The page never requests the destination osu! directory.

Source settings include receptor size, hit/combo/judgement positions, combo zoom,
and judgement zoom according to the current adapter contracts. Missing profile
settings use `ReceptorSize = 100`, zero Etterna position offsets, `ComboZoom = 1`,
and `JudgmentZoom = 1`. Missing theme preferences use Rebirth and produce a
diagnostic. Missing CMod omits a speed recommendation and offers the calculator;
it must not manufacture a converted speed. An unavailable judgement selection
uses the bundled standard judgement sheet with a diagnostic.

These defaults are explicit browser input choices, shown before conversion. They
do not relax an existing parser's requirements or add silent adapter fallbacks.
The entrypoint supplies the selected defaults to the shared visual operation;
existing complete-input callers continue to receive their current failures.

Only genuine absence permits these defaults. Malformed selected configurations,
unsafe references, unreadable files, and invalid images remain contextual errors.
The required NoteSkin and its essential note/receptor assets cannot be replaced
by generic defaults to turn an unsupported skin into an apparent success.

### osu!mania to Etterna

1. Select the skin directory containing `skin.ini` and its referenced assets.
2. Read the unique 4K Mania section and supported artwork/settings. Reject a
   missing or ambiguous 4K section. No osu! user CFG is requested or read.
3. Resolve density from the skin assets. Explicit `@2x` references remain
   authoritative. Since this input excludes the CFG, the browser presents an
   SD/HD choice with SD as the explicit initial selection; it does not infer a
   screen resolution or add a new automatic density-fallback policy. Pass the
   selected density to the same resolver policy used by the CLI, including only
   the already-supported SD fallback for implicit lane references.
   Missing selected-density judgement grades use the existing target fallback;
   mixed custom judgement densities remain an error under the existing contract.
4. Review converted receptor size, positions, combo zoom, and scroll direction.
   Show that scroll speed requires manual setup, alongside the calculator link.
5. Download the complete NoteSkin, judgement sheet, visual configuration, and
   installation guide. Repeat the calculator link beside the download and in the
   guide, explaining how to use the converted receptor size with the calculator.

The archive contains `NoteSkins/dance/<safe-name>/`,
`Assets/Judgments/<safe-name> 1x6[ (Doubleres)].png`, a generated
`profile-settings/playerConfig.lua`, and `INSTALLATION.md`. The settings file uses
the existing 1280x720/Rebirth-compatible coordinate contract. The guide identifies
the migrated keys, explains applying them to the player's theme settings, and
explains selecting the exported judgement in Etterna's asset settings.

The archive does not contain `Etterna.xml`, a numbered local profile, or a
replacement `assetsConfig.lua`. The browser has no target profile/theme inventory
with which to allocate identities or merge unrelated settings safely. The guide
instructs the player to back up existing settings and apply the migrated visual
values; their speed modifiers remain theirs to configure. In particular, the
reverse conversion never computes, displays, or serializes a fabricated CMod.

## Directory access and privacy

Use `showDirectoryPicker({ mode: "read" })` when available in a secure context.
Invoke it directly from a user gesture and handle cancellation as a normal return.
Feature-detect the API rather than assuming browser support. Fall back to a file
input with `webkitdirectory`, indexing `File.webkitRelativePath` after selection.
If neither API is available, explain the unsupported browser with an actionable
message instead of presenting a nonfunctional conversion button.

The handle implementation lists the installation root and relevant subdirectories
only. It does not recursively enumerate `Songs`, executables, caches, or unrelated
content. The file-input fallback may enumerate the whole selected tree inside the
browser; filter its file list before reading bytes. No implementation reads or
decodes irrelevant file contents. Skin assets are read on demand.

Normalize virtual paths, reject absolute paths and traversal, validate generated
path segments with Windows-compatible rules, reject ambiguous case-insensitive
matches, and enforce source-root containment. Directory selection is read-only.
Do not request write permission or modify source or destination installations.
Selected files and directory handles are session-only and are released on reset.

Fetch only the site's own bundled templates and code. Source bytes, profile names,
and diagnostics never enter network requests, telemetry, or persistent browser
storage. The calculator opens through an ordinary external link in a new tab with
`rel="noopener noreferrer"`; no profile or speed value is appended to its URL.

## Architecture and ownership

### Business rules are preserved

Modularity must come from separating input, coordination, format policy, and
technical mechanisms. It must not come from changing migration behavior to fit
the browser. Preserve formulas, validation, rounding, calibrated constants,
required assets, density precedence, allowed fallbacks, processing order,
dimensions, filenames, scale factors, scroll semantics, and diagnostics.

Mechanical extraction and dependency injection are permitted when evidence shows
the existing CLI still produces the same complete outputs and failures for the
same inputs. No formula recalibration, relaxed validation, expanded asset support,
new silent default, or alternative browser-specific migration implementation is
part of this work. If a technical backend cannot preserve a supported behavior,
resolve the technical limitation rather than redefining the business rule.

### Multiple entrypoints use one core

Keep `src/cli` and add `src/web` as separate composition roots. They collect user
choices, construct input sources, select supported application operations, wire
implementations, and present results. The shared core must not inspect whether a
request originated from a terminal, browser, or future entrypoint. Add `web` to the
architecture dependency matrix and reject dependencies between entrypoints.

Application operations own coordination through typed ports. Game adapters own
one shared implementation of their parsing, asset-selection, and target-format
policies. Pair-specific conversions own the existing semantic mappings. Runtime
implementations supply relative-path file access, image processing, templates,
and output publication; they contain no game-specific decisions. Keep the ports
small and driven by current operations, with no speculative future UI/API layer.

An additional entrypoint must be able to supply the same input/operation contracts
and alternate technical implementations without copying a migration algorithm or
importing another entrypoint. Both roots use the same parsing, semantic mapping,
and rendering policy modules; the only intended differences are the authorized
input scope and how the completed output is delivered.

Generic directory/file access, image processing, and archive generation remain in
infrastructure. Game-specific discovery, parsing, density selection, output names,
and template rendering remain in their respective adapters. New browser code
must not duplicate cross-game conversion formulas or import CLI installation code.

Extract pure parsing/rendering and narrowly scoped file/image ports only where
needed to share current behavior. Existing runtime implementations use Bun, local
filesystems, and Sharp. Browser implementations use selected directory handles or
Files and browser-compatible pixel processing. Core parsing and format-policy
modules must not eagerly import platform implementations; each composition root
supplies them. Avoid a broad rewrite of the CLI or an in-memory emulation of the
complete Node filesystem.

`ImageAsset.filePath` identifies a normalized source-relative asset in the browser;
the browser asset store resolves its bytes. Shared skin Lua remains statically
parsed using the existing AST analysis and is never executed.

### Visual migration is a separate requested operation

Preserve the full migration's required speed and current validation contract. Do
not make speed optional in the existing complete-input model to accommodate a
folder-only request, and do not insert a dummy source speed.

Expose a typed visual-migration operation accepting the visual subset of source
data and returning converted artwork/settings without speed. Extract the existing
visual orchestration into shared functions as needed; both the complete migration
and the visual operation call those functions and the same existing pair-specific
mapping functions. The full operation still converts speed using its unchanged
formula and validation. There must be one implementation of each mapping and
asset policy, with no copied partial-converter algorithm in `src/web`.

The web reverse route requests only the visual operation. The web forward route
requests the complete operation when the selected profile supplies speed, or the
visual operation with an explicit diagnostic when it does not. Neither entrypoint
decides how a property is converted. Browser reverse exporters do not invoke the
speed-required profile renderer. Tests protect visual-result equivalence and the
complete CLI's existing speed requirements, formulas, and output behavior.

Browser output is a complete virtual file set. Build and settle all output tasks
before creating the downloadable ZIP; on failure, expose no partial archive.
Keep the existing CLI transactional filesystem publishers and guarantees. ZIP
creation uses a small browser-compatible library with documented licensing.

Preserve current target inventories, geometry, SD/HD semantics, transparency,
frame/rotation order, receptor calibration, and judgement row order. The browser
image backend must preserve the existing image-operation contract, including its
resampling behavior; choosing Canvas alone is not evidence of equivalence. Verify
decoded pixel results against the current Sharp reference with the same fixtures.
Differences in lossless PNG encoding are acceptable; changed artwork, dimensions,
lane/state selection, alpha behavior, or placement are not. Use Canvas only where
it meets the contract, or a portable implementation of the existing operation.
Close decoded images and revoke object URLs after use. Limit concurrent
image decoding/rendering and report progress between assets. Bound input assets
to 32 MiB encoded and 16 megapixels decoded, and converted output to 256 MiB,
rejecting oversized inputs with contextual errors before rendering.

## Build, publication, and documentation

Use a small TypeScript/HTML/CSS frontend with Bun's browser-targeted build. Build
scripts belong under `.ci/web`; generated output stays ignored. Bundle JavaScript
dependencies locally. The published graph must contain no Sharp, Bun runtime API,
Node built-in imports, native prompts, or local installation defaults.

Use relative asset URLs suitable for `/vsrg-skin-converter/`. Publish only the
generated website through a dedicated GitHub Actions Pages workflow. Validate
the site build on pull requests, and deploy only from `main` or an authorized
manual invocation on `main`, using the `github-pages` environment. Pin actions
by full SHA; restrict Pages write/OIDC permissions to the deployment job. Keep
the Windows quality and release workflows intact. Repository Pages must use
GitHub Actions as its publishing source; deployment verification must confirm
the actual URL rather than assuming a successful local build is publication.

Bundle the required existing templates with their provenance, permissions, and
attribution. Include the project's GPL notice and the bundled judgement asset's
CC BY-NC attribution. Update the README, contribution guide, architecture, and
development standards for browser usage, boundaries, build, and checks. Add a
public minor Changeset with the implementation; this spec-only commit uses an
empty Changeset because it does not ship application behavior.

## Required evidence

- Follow TDD for production changes and do not introduce TypeScript `any`.
- Capture the existing CLI's supported successes and important failures before
  extraction. Keep these characterization tests green after modularization;
  adding the web entrypoint must not change complete migration business behavior.
- Run shared contract tests against native and browser implementations. Compare
  converted semantic values and decoded artwork for the same source fixtures;
  compare the reverse route's visual subset separately from its excluded speed
  and installation effects. PNG byte equality alone is not a pixel comparison.
- Enforce that shared core modules cannot import either entrypoint or runtime-only
  implementations, and that neither entrypoint imports or copies the other.
- Test both directory backends against the same discovery/read contract,
  including cancellation, containment, duplicates, and irrelevant-file exclusion.
- Test profile/skin selection, absent configuration defaults, fatal malformed
  configuration, density selection, and the reverse route's lack of CFG reads.
- Run both route integration tests after shared changes; protect the existing
  CLI's profile allocation, speed migration, and transactional installation.
- Verify exported ZIP file inventories and parsed configurations in both routes.
  Assert that reverse output contains no CMod or replacement profile XML.
- Test image dimensions, receptor alignment, lane/state pixels, transparent
  receptors, resampling equivalence, judgement fallbacks, and normal/double-density
  sheets. Audit the applicable real skins under `tmp` as required by the
  development standards.
- Exercise both flows in a real browser, including directory selection, missing
  settings, progress, a failed image, and downloading/extracting the final ZIP.
  Run a Chromium handle-path check and a file-input fallback check. If browser
  automation cannot drive a native folder dialog, record a manual smoke check
  in addition to the automated backend contract tests.
- Build the site and verify its dependency graph and repository-base asset URLs.
  Run the repository's complete quality gate and `git diff --check`.
- After publication, verify that the deployed page loads its code/templates and
  produces a valid download. Report unavailable deployment access explicitly.

## Exclusions

No backend, uploaded-file processing, login, cloud storage, automatic installation,
filesystem overwrites, reverse speed migration, additional games/key counts,
full Lua evaluation, changed migration business rules, or unrelated CLI
refactoring. ZIP source import is deferred:
the approved input contract is folder selection in both directions.

## References

- [Architecture](../architecture.md)
- [Development standards](../development-standards.md)
- [GitHub Pages hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Directory picker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- [Directory file input](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory)
- [CMod Calculator](https://cmodcalc.com/)
