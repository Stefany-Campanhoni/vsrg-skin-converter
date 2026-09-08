# Bun Migration PRD

## Objective

Migrate the repository-controlled runtime, tests, package manager, scripts, hooks, CI,
build, and Windows portable distribution from Node.js to Bun 1.4.0 without changing CLI
behavior or conversion output.

The supported public artifact remains the Windows 10+ x64 ZIP. Sharp remains the image
processor. A standalone executable is a manual experiment only and must not appear in a
workflow, draft release, or published release.

The release intent is `minor`; Changesets will calculate the version from the current
`1.0.2` to `1.1.0` after the integration branch reaches `main`.

## Bun-first contract

Repository-owned code uses stable Bun or Web APIs when they preserve the existing contract.
Node compatibility APIs remain only where Bun has no complete or safe replacement.

| Current API | Target | Policy |
| --- | --- | --- |
| `node:test`, `node:assert/strict` | `bun:test`, `expect` | Replace completely |
| First-party `Buffer` | `Uint8Array`, typed-array and text APIs | Replace; Sharp output is treated as `Uint8Array` |
| `node:crypto` | `Bun.CryptoHasher`, Web Crypto | Replace completely |
| `node:child_process`, `node:util` | `Bun.spawn`, `Bun.spawnSync` | Replace completely |
| `node:url` | Bun URL helpers and `import.meta` | Replace completely |
| `node:stream` in release scripts | Web Streams, `Bun.file`, `Bun.write` | Replace completely |
| Simple file reads, writes, copies | `Bun.file`, `Bun.write` | Replace when error and overwrite semantics match |
| Directory, link, realpath, atomic rename, recursive removal, temporary and synchronous operations | `node:fs` | Retain with explicit justification |
| Path manipulation | `node:path` | Retain; Bun has no equivalent module |
| Temporary directory | `node:os.tmpdir` | Retain |
| Arguments, environment, entrypoint | `Bun.argv`, `Bun.env`, `import.meta.main` | Replace |
| Platform, cwd, deferred exit code | Node-compatible `process` APIs | Retain |

Third-party package internals, including Sharp and GitHub Actions implementations, are
outside the first-party API guardrail.

## Toolchain and distribution requirements

- Pin `bun@1.4.0` in package metadata, CI, and the redistributed runtime.
- Commit the text `bun.lock`; remove `package-lock.json`; use `bun ci` in automation.
- Use `bun` and `bunx` for repository commands and `@types/bun` for Bun plus compatibility
  types.
- Configure a 15-second test timeout and prove that every existing test file is discovered.
- Build `app.mjs` with `Bun.build`, leaving Sharp external in the supported ZIP.
- Redistribute the official `bun-windows-x64-baseline.zip`, pinned by its official SHA-256,
  and separately pin the extracted executable SHA-256 and reported revision.
- Package only the launcher, `runtime/bun.exe`, `app.mjs`, templates, Sharp's proven Windows
  x64 runtime closure, and required licenses.
- Preserve transactional cache, assembly, verification, ZIP, checksum, tag, and draft
  behavior.
- Verify the extracted ZIP without Bun or Node on `PATH`, from an unrelated cwd and a path
  containing spaces, including one real Sharp PNG operation.

## Standalone experiment

The optional manual task adds `bun run build:standalone` and writes its candidate below an
ignored build directory. It may use direct N-API addon imports and embedded DLL assets, but
it must not edit workflows or release metadata. Automated local smoke covers startup,
`--help`, exit-code propagation, and a real Sharp PNG operation.

The candidate is integrated only after manual comparison with the ZIP on at least three
representative skins in each conversion direction, covering notes, long notes, receptors,
judgements, transparency, and different image resolutions. Failure leaves the experiment
outside the integration branch and does not block the supported ZIP migration.

## Acceptance criteria

- A clean checkout with Bun 1.4.0 and no Node on `PATH` can install, test, type-check, lint,
  build, verify, and assemble the supported Windows release.
- Test discovery is complete, with zero failures and only the pre-existing justified skips.
- Golden integration and pixel-level Sharp behavior remain equivalent.
- The release rejects incoherent manifests/lockfiles, invalid SemVer/changelog state,
  tampered runtime archives, unsafe paths, links, incomplete packages, and failed rollback.
- An architecture guard rejects forbidden Node APIs and tooling while enforcing the narrow
  documented allowlist.
- Public documentation describes Bun source development and the Bun-based portable ZIP.

## Out of scope

Linux, macOS, ARM64, code signing, auto-update, replacement of Sharp, and publication of the
standalone executable are not part of this program.
