# Public Repository Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add version-controlled GitHub quality, security, dependency, and contributor controls without publishing or changing repository administration.

**Architecture:** Keep executable quality/security automation under `.github/workflows`, dependency automation in `.github/dependabot.yml`, and human governance in focused root and `.github` documents. Protect the essential contract with one repository-policy test so accidental removal or permission expansion fails locally.

**Tech Stack:** GitHub Actions, Node.js 22.23.2, npm, CodeQL, TruffleHog, Dependabot, Node test runner, actionlint

**Spec:** `docs/superpowers/specs/2026-08-13-public-repository-governance-design.md`

## Global Constraints

- Preserve every current uncommitted change and the Node SEA worktree.
- Do not push, tag, publish, create a pull request, or modify GitHub administrative settings.
- Write all documentation and technical identifiers in English.
- Pin every Action to a full commit SHA and keep workflow permissions minimal.
- Do not add a release-publication workflow in this change.

---

### Task 1: Repository Policy Contract

**Files:**
- Create: `tests/repository/public-repository-controls.test.ts`

**Interfaces:**
- Consumes: version-controlled files under `.github` and the repository root.
- Produces: a local regression gate for required public-repository controls.

- [x] **Step 1: Write the failing policy test**

Create a Node test that reads the planned workflow, Dependabot, ownership, contribution,
security, pull-request, issue, and release-note files. Assert that workflows have explicit
permissions, CI contains every documented gate, checkout pins are full SHAs, CodeQL has
`security-events: write`, TruffleHog uses full history, Dependabot covers all three package
ecosystems/locations, and both contribution documents exist.

- [x] **Step 2: Verify RED**

Run:

```powershell
node --test tests/repository/public-repository-controls.test.ts
```

Expected: FAIL because `.github/workflows/ci.yml` and the other controls do not exist.

- [x] **Step 3: Keep the test focused on stable policy**

Do not assert whitespace or complete file snapshots. Assert filenames, trigger intent,
permission values, full-SHA action references, required commands, package locations, and
contact/reporting channels.

---

### Task 2: Contributor Governance

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.github/CODEOWNERS`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

**Interfaces:**
- Consumes: `docs/development-standards.md`, `docs/architecture.md`, and existing npm scripts.
- Produces: contributor and vulnerability-reporting contracts plus structured GitHub forms.

- [x] **Step 1: Add contribution and security documentation**

Document Node/Windows setup, required commands, architecture boundaries, TDD expectation,
asset permission/provenance, sanitized reports, SemVer prereleases, and the prohibition on
publishing from contributor branches. Direct security reports to GitHub private
vulnerability reporting with `scampanhoni@gmail.com` as fallback.

- [x] **Step 2: Add ownership and contribution templates**

Assign `@Stefany-Campanhoni` globally and repeat ownership for `.github`, release scripts,
distribution inputs, templates, license, and package manifests. Add PR and issue questions
that cover both conversion directions, Windows reproduction, tests, docs, rollback,
security, and template provenance.

- [x] **Step 3: Verify focused GREEN remains pending only on automation files**

Run the policy test. Expected: contributor-document assertions pass; workflow and dependency
assertions still fail.

---

### Task 3: Windows Quality Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root `package-lock.json` and npm quality scripts.
- Produces: stable required-check job `windows-quality`.

- [x] **Step 1: Add the least-privilege workflow**

Trigger on pull requests and pushes to `main`. Use `windows-latest`, Node 22.23.2, npm cache,
`npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:architecture`, strict
unused TypeScript, and `git diff --check`. Set `permissions: contents: read`, a 20-minute
timeout, and concurrency keyed by workflow/ref with pull-request cancellation.

- [x] **Step 2: Run the policy test**

Expected: CI assertions pass; security and Dependabot assertions still fail.

---

### Task 4: Security Workflows

**Files:**
- Create: `.github/workflows/codeql.yml`
- Create: `.github/workflows/secret-scan.yml`

**Interfaces:**
- Consumes: repository source and full Git history.
- Produces: CodeQL results and secret-scan status checks.

- [x] **Step 1: Add CodeQL**

Use the official CodeQL init/analyze actions pinned to full SHAs. Analyze
`javascript-typescript` on pull requests, pushes to `main`, weekly schedule, and manual runs.
Grant only `contents: read`, `security-events: write`, `packages: read`, and the permissions
required for pull-request analysis.

- [x] **Step 2: Add TruffleHog**

Use checkout with `fetch-depth: 0` and the official TruffleHog action pinned to a full SHA.
Trigger on pull requests, pushes to `main`, weekly schedule, and manual runs. Use
`--results=verified,unknown` and read-only contents permission.

- [x] **Step 3: Run the policy test**

Expected: workflow assertions pass; only dependency/release metadata assertions remain red.

---

### Task 5: Dependency and Release-Note Automation

**Files:**
- Create: `.github/dependabot.yml`
- Create: `.github/release.yml`

**Interfaces:**
- Consumes: root npm lockfile, `scripts/release/runtime-package/package-lock.json`, and GitHub Actions references.
- Produces: weekly update pull requests and categorized generated release notes.

- [x] **Step 1: Configure Dependabot**

Add weekly npm entries for `/` and `/scripts/release/runtime-package`, plus a weekly
`github-actions` entry for `/`. Group patch/minor production and development updates while
leaving major updates individually reviewable. Cap open pull requests to avoid noise.

- [x] **Step 2: Configure release-note categories**

Categorize breaking changes, features, fixes, documentation, dependencies, and maintenance;
exclude duplicate/invalid/wontfix labels. This file must not create or publish releases.

- [x] **Step 3: Verify GREEN**

Run the repository policy test. Expected: PASS.

---

### Task 6: Workflow and Repository Verification

**Files:**
- Modify only if verification reveals a confirmed defect in files created by Tasks 1–5.

**Interfaces:**
- Consumes: all new governance controls.
- Produces: evidence that local tests and GitHub workflow syntax are clean.

- [x] **Step 1: Validate workflow syntax**

Download a pinned actionlint Windows release to a temporary directory outside the repository,
verify its published checksum, and run:

```powershell
actionlint .github/workflows/*.yml
```

Expected: exit code 0 with no diagnostics.

- [x] **Step 2: Run complete local gates**

```powershell
npm test
npm run typecheck
npm run lint
npm run test:architecture
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
git diff --check
```

Expected: every command exits 0.

- [x] **Step 3: Review scope and GitHub recommendations**

Confirm no release, tag, push, ruleset, or administrative setting was created. Inspect the
final diff, verify the Node SEA worktree remains registered, and prepare exact recommended
ruleset/repository settings with reasons and sole-maintainer trade-offs.
