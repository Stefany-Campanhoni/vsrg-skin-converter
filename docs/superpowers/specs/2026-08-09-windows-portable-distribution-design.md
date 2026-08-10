# Windows Portable Distribution Design

## Objective

Distribute VSRG Skin Converter to Windows x64 users as a portable ZIP that does not require
Node.js or npm to be installed. Develop that supported distribution in the primary worktree
while an isolated worktree evaluates a single-executable Node SEA prototype. The SEA result
is evidence for a later decision, not an alternative release artifact in this scope.

## Scope

The supported deliverable is a Windows x64 ZIP containing the application bundle, a pinned
Node.js runtime, the Windows x64 Sharp runtime files, external templates, launch and license
files, and a SHA-256 checksum. Existing Etterna-to-osu! and osu!-to-Etterna behavior must not
change.

The first release does not include an installer, automatic updates, code signing, GitHub
Release publication, Windows ARM64, Linux, or macOS packages. These are independent future
features.

## Parallel Workstreams

### Supported portable ZIP

The primary worktree implements and documents the maintained release path:

- bundle the TypeScript entry point into one Node-targeted ESM file;
- keep Sharp external because it loads platform-specific native binaries;
- include a pinned official Node.js Windows x64 runtime;
- copy the osu! and Etterna templates without transforming their content;
- include only the production runtime files required by Sharp;
- provide a launcher that works when double-clicked or invoked from another directory;
- create a versioned ZIP and SHA-256 checksum;
- verify the assembled and extracted artifact before accepting the build.

### Experimental Node SEA prototype

A separate agent works in a separate Git worktree and branch created from the approved design
commit. Its bounded objective is a functional Windows x64 prototype and a technical report.
It evaluates:

- bundling the CLI into the CommonJS entry required by Node SEA;
- loading Sharp and its native dependencies;
- embedding templates or extracting them safely for file-based target writers;
- running the executable from a clean directory and a path containing spaces;
- output size, startup behavior, operational workarounds, and maintenance cost.

The SEA worktree must not modify the primary worktree or merge itself. Its result is reviewed
after both tracks finish. SEA changes enter the maintained branch only through a separate,
explicit user decision.

## Supported ZIP Layout

The release archive has one top-level versioned directory:

```text
vsrg-skin-converter-v<version>-win-x64/
|-- vsrg-skin-converter.cmd
|-- app.mjs
|-- runtime/
|   `-- node.exe
|-- node_modules/
|   |-- sharp/
|   `-- @img/
|-- templates/
|   |-- osu/
|   `-- etterna/
|-- README.txt
|-- LICENSE
`-- THIRD-PARTY-NOTICES.txt
```

The ZIP and its adjacent checksum use the same version and platform stem. The package version
comes from `package.json`. The release configuration selects the latest supported Node 22 LTS
patch when first implemented, records that exact version and official checksum in the
repository, and uses only that pinned runtime until intentionally updated.

## Runtime Resource Resolution

Runtime resources must never depend on `process.cwd()`. A module located directly below
`src` owns the application resource root. During source execution its module directory is
`src`, where `templates` already exists. In the ESM bundle its module URL is the release
directory containing `app.mjs`, where the build copies the same `templates` directory.

The existing game-specific template exports continue to be the only template paths consumed
by CLI composition. Tests must prove that changing the current working directory does not
change either resolved template path.

## Build Pipeline

The build is orchestrated by a dedicated repository script and exposed through npm commands.
The intended command surface is:

```text
npm run build
npm run build:windows
npm run test:distribution
npm run release:windows
```

Responsibilities are separated as follows:

- `build` creates the application bundle;
- `build:windows` assembles an unpacked Windows x64 distribution in a controlled staging
  directory;
- `test:distribution` verifies the unpacked package and an independently extracted ZIP;
- `release:windows` runs required quality gates, assembles and verifies the package, then
  writes the ZIP and checksum.

The bundler targets the supported Node baseline and emits ESM. It bundles JavaScript-only
application dependencies while marking `sharp` external. Runtime dependencies are installed
or copied into a clean Windows x64 staging tree rather than copying the repository's complete
`node_modules`. Development files, tests, source maps unless explicitly enabled for a debug
build, caches, temporary output, and TypeScript sources are excluded.

The build script owns one narrowly defined output root and validates its absolute path before
cleaning it. Source templates and any pre-existing release artifact outside that root are
never mutated.

## Launcher and CLI Metadata

`vsrg-skin-converter.cmd` derives every path from `%~dp0`, invokes the included `node.exe`
with `app.mjs`, forwards all arguments, preserves the application exit code, and keeps errors
visible to a user who double-clicks it.

The CLI gains non-interactive `--help` and `--version` paths. They return successfully without
starting prompts or accessing either game installation. Unknown arguments return a non-zero
exit code with concise usage guidance. The existing no-argument interactive flow remains
unchanged.

## Error Handling

Package assembly fails before ZIP creation when any required template, runtime file, Sharp
binary, launcher, license, or metadata file is missing. It also fails when the included Sharp
module cannot perform a real image operation.

Distribution verification treats an unexpected file as an error, so development artifacts
cannot silently enter the archive. Downloaded runtime archives and the final ZIP are verified
with SHA-256. Errors retain the failed build phase and path; partial staging output is removed
when safely owned by the build, while the previous successful release artifact is preserved
until a replacement passes verification.

## Verification

The supported workstream must pass:

- the existing test suite, typecheck, lint, strict unused checks, architecture test, and
  `git diff --check`;
- unit tests for module-relative resource resolution and CLI argument handling;
- an exact package-manifest test for required and forbidden archive entries;
- a smoke test launched from a working directory outside the extracted package;
- the same smoke test with spaces in the extraction path;
- a real Sharp decode or resize using only packaged runtime files;
- template reads for both game-specific template roots;
- `--help` and `--version` using the packaged launcher;
- checksum verification after ZIP creation and extraction.

The SEA prototype reuses these smoke-test expectations where its layout permits and records
every exception in its report. A prototype that requires an installed Node.js, npm install at
the destination, or access to repository files is not considered functional.

## Documentation and Licensing

The README documents development commands separately from end-user ZIP usage. The packaged
README explains extraction, launch, supported platform, game-folder selection, and the lack of
automatic updates or code signing. `THIRD-PARTY-NOTICES.txt` records the redistributed Node.js,
Sharp, and native runtime licensing obligations, with required upstream license files retained
in the package when redistribution terms require them.

## Acceptance Criteria

The supported work is complete when a user can extract the versioned ZIP on a clean Windows
x64 environment, run the launcher without installing development tools, reach the CLI, and
perform image processing with packaged templates and Sharp. Running from another working
directory or a path containing spaces must behave identically.

The experimental work is complete when the isolated branch contains a reproducible SEA
prototype or a demonstrated technical blocker, automated smoke evidence, and a comparison
report. Neither outcome changes the supported ZIP implementation without explicit approval.
