# Browser Skin Converter on GitHub Pages

Date: 2026-10-12
Status: Awaiting written-spec review

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

The scroll-speed exclusion is interpreted as specific to osu!mania to Etterna.
Etterna to osu!mania retains speed conversion when the selected profile supplies
a valid CMod; its result is installation guidance rather than a local CFG edit.

This document defines the proposed implementation. Product code, dependencies,
GitHub repository settings, and deployment have not been changed at this stage.

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

Only genuine absence permits these defaults. Malformed selected configurations,
unsafe references, unreadable files, and invalid images remain contextual errors.
The required NoteSkin and its essential note/receptor assets cannot be replaced
by generic defaults to turn an unsupported skin into an apparent success.

### osu!mania to Etterna

1. Select the skin directory containing `skin.ini` and its referenced assets.
2. Read the unique 4K Mania section and supported artwork/settings. Reject a
   missing or ambiguous 4K section. No osu! user CFG is requested or read.
3. Resolve density from the skin assets. Explicit `@2x` references remain
   authoritative. For implicit references, prefer HD when the required lane
   assets can be resolved, using the existing allowed SD lane fallback; otherwise
   select SD. Show the chosen density and allow an SD/HD override in the review.
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

Keep the current game-neutral model and pair-specific semantic formulas as the
shared core. Add `src/web` as the browser composition root, owning DOM interaction,
directory-selection coordination, route wiring, and presentation. Add its allowed
dependencies to the architecture matrix alongside the existing CLI root.

Generic directory/file access, image processing, and archive generation remain in
infrastructure. Game-specific discovery, parsing, density selection, output names,
and template rendering remain in their respective adapters. New browser code
must not duplicate cross-game conversion formulas or import CLI installation code.

Extract pure parsing/rendering and narrowly scoped file/image ports only where
needed to share current behavior. Existing runtime implementations use Bun, local
filesystems, and Sharp. Browser implementations use selected directory handles or
Files, Web image APIs, and Canvas. Avoid a broad rewrite of the CLI or an in-memory
emulation of the complete Node filesystem.

`ImageAsset.filePath` identifies a normalized source-relative asset in the browser;
the browser asset store resolves its bytes. Shared skin Lua remains statically
parsed using the existing AST analysis and is never executed.

Represent an unavailable scroll speed explicitly in the neutral model, rather
than injecting a placeholder solely to satisfy a required number. Pair-specific
conversions skip speed conversion when it is absent. CLI readers continue to
provide speed, and CLI installation writers continue to require it where their
output contract needs it. Browser reverse readers omit it intentionally; browser
reverse exporters never call the speed-required profile renderer. Tests protect
both the browser omission and the existing CLI speed-conversion behavior.

Browser output is a complete virtual file set. Build and settle all output tasks
before creating the downloadable ZIP; on failure, expose no partial archive.
Keep the existing CLI transactional filesystem publishers and guarantees. ZIP
creation uses a small browser-compatible library with documented licensing.

Preserve current target inventories, geometry, SD/HD semantics, transparency,
frame/rotation order, receiver calibration, and judgement row order. Canvas
resampling need not be byte-identical to Sharp, but exported image dimensions,
lane/state selection, alpha behavior, and placement must satisfy the same tested
contracts. Close decoded images and revoke object URLs after use. Limit concurrent
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
- Test both directory backends against the same discovery/read contract,
  including cancellation, containment, duplicates, and irrelevant-file exclusion.
- Test profile/skin selection, absent configuration defaults, fatal malformed
  configuration, density selection, and the reverse route's lack of CFG reads.
- Run both route integration tests after shared changes; protect the existing
  CLI's profile allocation, speed migration, and transactional installation.
- Verify exported ZIP file inventories and parsed configurations in both routes.
  Assert that reverse output contains no CMod or replacement profile XML.
- Test image dimensions, receptor alignment, lane/state pixels, transparent
  receptors, judgement fallbacks, and normal/double-density sheets. Audit the
  applicable real skins under `tmp` as required by the development standards.
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
full Lua evaluation, or unrelated CLI refactoring. ZIP source import is deferred:
the approved input contract is folder selection in both directions.

## References

- [Architecture](../architecture.md)
- [Development standards](../development-standards.md)
- [GitHub Pages hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Directory picker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- [Directory file input](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory)
- [CMod Calculator](https://cmodcalc.com/)
