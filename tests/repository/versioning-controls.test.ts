import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import packageJson from "../../package.json" with { type: "json" }

const root = new URL("../../", import.meta.url)

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), "utf8")
}

function assertActionsArePinned(workflow: string): void {
  const references = workflow.match(/^\s*-?\s*uses:\s+\S+/gm) ?? []
  assert.ok(references.length > 0, "expected at least one GitHub Action reference")
  for (const reference of references) {
    assert.match(reference, /@[0-9a-f]{40}$/, `Action must use a full commit SHA: ${reference}`)
  }
}

test("configures Changesets for a private single-package application", async () => {
  const manifest = packageJson as typeof packageJson & {
    private?: boolean
    scripts: Record<string, string>
    devDependencies: Record<string, string>
  }
  const config = JSON.parse(await read(".changeset/config.json")) as {
    baseBranch?: string
    changelog?: unknown
    privatePackages?: { version?: boolean; tag?: boolean }
  }

  assert.equal(manifest.private, true)
  assert.equal(manifest.scripts.changeset, "changeset")
  assert.equal(manifest.scripts["changeset:status"], "changeset status")
  assert.equal(manifest.scripts["changeset:version"], "changeset version")
  assert.equal(manifest.scripts["changeset:pre"], "changeset pre")
  assert.ok(manifest.devDependencies["@changesets/cli"])
  assert.ok(manifest.devDependencies["@changesets/changelog-github"])
  assert.equal(config.baseBranch, "main")
  assert.deepEqual(config.changelog, [
    "@changesets/changelog-github",
    { repo: "Stefany-Campanhoni/vsrg-skin-converter" },
  ])
  assert.deepEqual(config.privatePackages, { version: true, tag: false })
})

test("enforces conventional commits locally and in pull requests", async () => {
  const [hook, commitlint, quality] = await Promise.all([
    read(".husky/commit-msg"),
    read("commitlint.config.cjs"),
    read(".github/workflows/ci.yml"),
  ])

  assert.equal(hook.trim(), 'npx --no-install commitlint --edit "$1"')
  assert.match(commitlint, /defaultIgnores:\s*false/)
  for (const type of [
    "feat",
    "fix",
    "perf",
    "refactor",
    "docs",
    "test",
    "build",
    "ci",
    "chore",
    "revert",
    "deps",
  ]) {
    assert.match(commitlint, new RegExp(`["']${type}["']`))
  }
  assert.match(quality, /Validate pull request title and commits/)
  assert.match(quality, /commitlint --from/)
  assert.match(quality, /commitlint --verbose/)
})

test("requires a Changeset on every non-release pull request", async () => {
  const quality = await read(".github/workflows/ci.yml")

  assert.match(packageJson.scripts.lint, /\.ci/)
  assert.match(packageJson.scripts.format, /\.ci/)
  assert.match(quality, /Validate pull request Changeset/)
  assert.match(quality, /changeset-release\/main/)
  assert.match(quality, /\.ci\/quality\/assert-pr-changeset\.ts/)
  assert.match(quality, /changeset status --since/)
})

test("keeps agent guidance as links to canonical project documentation", async () => {
  const agents = await read("AGENTS.md")

  for (const document of [
    "readme.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "docs/architecture.md",
    "docs/development-standards.md",
    "docs/agent-prompt-guidelines.md",
  ]) {
    assert.match(agents, new RegExp(document.replaceAll(".", "\\.")))
  }
  assert.match(agents, /canonical/i)
})

test("maintains one Changesets release pull request from main", async () => {
  const workflow = await read(".github/workflows/changesets.yml")

  assert.match(workflow, /push:\s*\r?\n\s+branches:\s*\r?\n\s+- main/)
  assert.match(workflow, /contents:\s+write/)
  assert.match(workflow, /pull-requests:\s+write/)
  assert.match(workflow, /secrets\.CHANGESETS_TOKEN/)
  assert.match(workflow, /version:\s+npm run changeset:version/)
  assert.match(workflow, /commit:\s+["']chore\(release\): version packages["']/)
  assert.match(workflow, /title:\s+["']chore\(release\): version packages["']/)
  assert.doesNotMatch(workflow, /publish:/)
  assertActionsArePinned(workflow)
})

test("creates a versioned Windows draft release only after a verified bump", async () => {
  const workflow = await read(".github/workflows/draft-release.yml")

  assert.match(workflow, /push:\s*\r?\n\s+branches:\s*\r?\n\s+- main/)
  assert.doesNotMatch(workflow, /workflow_dispatch/)
  assert.match(workflow, /contents:\s+write/)
  assert.match(workflow, /detect-version-release\.ts/)
  assert.match(workflow, /npm run release:windows/)
  assert.match(workflow, /gh release create/)
  assert.match(workflow, /--draft/)
  assert.match(workflow, /--prerelease/)
  assert.match(workflow, /--target/)
  assert.match(workflow, /gh release view/)
  assert.match(workflow, /\.zip/)
  assert.match(workflow, /\.sha256/)
  assertActionsArePinned(workflow)
})

test("documents contributor and maintainer versioning responsibilities", async () => {
  const [readme, contributing, standards, agents, pullRequest] = await Promise.all([
    read("readme.md"),
    read("CONTRIBUTING.md"),
    read("docs/development-standards.md"),
    read("docs/agent-prompt-guidelines.md"),
    read(".github/PULL_REQUEST_TEMPLATE.md"),
  ])

  for (const document of [readme, contributing, standards]) {
    assert.match(document, /Changesets/)
    assert.match(document, /CHANGESETS_TOKEN/)
    assert.match(document, /draft release/i)
  }
  assert.match(contributing, /npm run changeset -- --empty/)
  assert.match(contributing, /npm run changeset:pre -- (?:enter beta| exit)/)
  assert.match(agents, /Changeset/i)
  assert.match(agents, /Conventional Commit/i)
  assert.match(pullRequest, /\.changeset\/.*\.md/)
  assert.match(pullRequest, /Conventional Commit/i)
})
