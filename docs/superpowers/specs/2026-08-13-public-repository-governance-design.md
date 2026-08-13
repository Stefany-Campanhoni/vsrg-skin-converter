# Public Repository Governance Design

## Objective

Add the version-controlled quality, security, dependency, and contributor controls required
for a public GitHub repository without changing GitHub administrative settings or publishing
a release.

## Scope

The repository will gain:

- a Windows quality workflow for pull requests and `main`;
- CodeQL analysis for JavaScript and TypeScript;
- TruffleHog secret scanning for pull requests, `main`, schedules, and manual runs;
- Dependabot configuration for the root npm project, the isolated Sharp runtime package,
  and GitHub Actions;
- contributor, security, ownership, pull-request, issue, and release-note documentation;
- a repository-policy test that protects the essential workflow and documentation contract.

The implementation will not create tags, releases, branches, pull requests, or GitHub
rulesets. It will not change repository features, merge methods, branch protection, or the
preserved Node SEA worktree.

## Workflow Design

`ci.yml` runs on `windows-latest` because the supported product and native folder picker are
Windows-specific. It uses Node.js 22.23.2, installs with `npm ci`, and runs the same quality
gates documented for local development. It has read-only repository permissions, a bounded
timeout, and pull-request concurrency cancellation.

`codeql.yml` analyzes JavaScript and TypeScript on pull requests, pushes to `main`, and a
weekly schedule. It grants only `contents: read`, `security-events: write`, and the event
permissions required by CodeQL.

`secret-scan.yml` checks out complete history and uses the official TruffleHog action pinned
to a full commit SHA. Pull requests and pushes use the event range; scheduled and manual runs
scan the full repository. It has read-only contents permission.

All third-party and GitHub-maintained actions are pinned to full commit SHAs. Dependabot is
responsible for proposing reviewed pin updates.

## Contributor Governance

`CONTRIBUTING.md` defines setup, required gates, architecture rules, pull-request scope,
asset provenance, versioning, and release boundaries. `SECURITY.md` defines supported
versions and asks reporters to use GitHub private vulnerability reporting rather than public
issues; the contact email is a fallback.

`CODEOWNERS` assigns the repository to `@Stefany-Campanhoni` and explicitly lists security,
release, license, dependency, and template boundaries. Enforcement remains an optional
ruleset choice because a sole maintainer cannot approve their own pull request.

The pull-request template requires route-impact, tests, documentation, security, asset
provenance, and release-impact declarations. Issue forms collect sanitized reproduction
details without asking users to expose local secrets or unnecessary absolute paths.

## Dependency and Release Metadata

Dependabot runs weekly with separate entries for `/`, `/scripts/release/runtime-package`, and
GitHub Actions. Non-breaking npm updates are grouped per ecosystem to limit noise; major
updates stay separate for explicit review.

`.github/release.yml` categorizes automatically generated release notes. It does not create
or publish releases.

## Verification

A Node test under `tests/repository` reads the version-controlled controls and asserts their
presence and security-critical invariants. The test is written first and must fail because
the controls are absent. Workflow files are then checked with actionlint in addition to the
normal repository gates.

The complete verification is:

```text
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
actionlint .github/workflows/*.yml
```

No release build is required because the change does not alter application or distribution
behavior; the previously verified ZIP remains ignored and untouched.
