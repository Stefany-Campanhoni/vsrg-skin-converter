import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import packageJson from "../../package.json" with { type: "json" }

const root = new URL("../../", import.meta.url)
async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), "utf8")
}

function assertAllActionReferencesArePinned(workflow: string): void {
  const actionReferences = workflow.match(/^\s*-?\s*uses:\s+\S+/gm) ?? []
  assert.ok(actionReferences.length > 0, "expected at least one Action reference")
  for (const reference of actionReferences) {
    assert.match(reference, /@[0-9a-f]{40}$/, `Action must use a full commit SHA: ${reference}`)
  }
}

test("Windows CI exposes one stable least-privilege quality check", async () => {
  const workflow = await read(".github/workflows/ci.yml")

  assert.match(workflow, /permissions:\s*\r?\n\s+contents:\s+read/)
  assert.match(workflow, /windows-quality:/)
  assert.match(workflow, /runs-on:\s+windows-latest/)
  assert.match(workflow, /timeout-minutes:\s+20/)
  assert.match(workflow, /node-version:\s+["']?22\.23\.2/)
  assert.match(workflow, /fetch-depth:\s+0/)
  for (const command of ["npm ci", "npm run check", "git diff --check"]) {
    assert.ok(workflow.includes(command), `CI must run ${command}`)
  }
  for (const command of [
    "npm test",
    "npm run typecheck",
    "npm run lint",
    "npm run test:architecture",
    "npx tsc --noEmit --noUnusedLocals --noUnusedParameters",
  ]) {
    assert.ok(packageJson.scripts.check.includes(command), `quality gate must run ${command}`)
  }
  assertAllActionReferencesArePinned(workflow)
})

test("security workflows use minimal permissions, complete history, and pinned Actions", async () => {
  const [codeql, secrets] = await Promise.all([
    read(".github/workflows/codeql.yml"),
    read(".github/workflows/secret-scan.yml"),
  ])

  assert.match(codeql, /security-events:\s+write/)
  assert.match(codeql, /contents:\s+read/)
  assert.match(codeql, /languages:\s+["']?javascript-typescript/)
  assert.match(codeql, /schedule:\s*\r?\n\s+- cron:/)
  assertAllActionReferencesArePinned(codeql)

  assert.match(secrets, /contents:\s+read/)
  assert.match(secrets, /fetch-depth:\s+0/)
  assert.match(secrets, /--results=verified,unknown/)
  assertAllActionReferencesArePinned(secrets)
})

test("CodeQL initialization and analysis use one action release", async () => {
  const codeql = await read(".github/workflows/codeql.yml")
  const actionShas = [
    ...codeql.matchAll(/uses:\s+github\/codeql-action\/(?:init|analyze)@([0-9a-f]{40})/g),
  ].map((match) => match[1])

  assert.equal(actionShas.length, 2, "expected both CodeQL init and analyze actions")
  assert.equal(new Set(actionShas).size, 1, "CodeQL actions must use the same release SHA")
})

test("dependency updates cover both npm locks and GitHub Actions", async () => {
  const dependabot = await read(".github/dependabot.yml")

  assert.match(dependabot, /package-ecosystem:\s+["']npm["']/)
  assert.match(dependabot, /directory:\s+["']\/["']/)
  assert.match(dependabot, /directory:\s+["']\/\.ci\/release\/runtime-package["']/)
  assert.match(dependabot, /package-ecosystem:\s+["']github-actions["']/)
  assert.match(dependabot, /interval:\s+["']weekly["']/)
})

test("Dependabot updates every CodeQL action atomically across major versions", async () => {
  const dependabot = await read(".github/dependabot.yml")

  assert.match(
    dependabot,
    /codeql-actions:\s*\r?\n\s+patterns:\s*\r?\n\s+- ["']github\/codeql-action\/\*["']/,
  )
  assert.match(
    dependabot,
    /codeql-actions:[\s\S]*?update-types:\s*\r?\n\s+- ["']major["']\s*\r?\n\s+- ["']minor["']\s*\r?\n\s+- ["']patch["']/,
  )
  assert.match(dependabot, /exclude-patterns:\s*\r?\n\s+- ["']github\/codeql-action\/\*["']/)
})

test("repository checkouts preserve the formatter line-ending contract", async () => {
  const attributes = await read(".gitattributes")

  assert.match(attributes, /^\*\s+text=auto\s+eol=lf$/m)
  for (const extension of ["png", "zip", "exe"]) {
    assert.match(attributes, new RegExp(`^\\*\\.${extension}\\s+binary$`, "m"))
  }
})

test("public contribution and reporting controls are present", async () => {
  const [contributing, security, codeowners, pullRequest, bug, feature, issueConfig, releases] =
    await Promise.all([
      read("CONTRIBUTING.md"),
      read("SECURITY.md"),
      read(".github/CODEOWNERS"),
      read(".github/PULL_REQUEST_TEMPLATE.md"),
      read(".github/ISSUE_TEMPLATE/bug.yml"),
      read(".github/ISSUE_TEMPLATE/feature.yml"),
      read(".github/ISSUE_TEMPLATE/config.yml"),
      read(".github/release.yml"),
    ])

  assert.match(contributing, /docs\/development-standards\.md/)
  assert.match(contributing, /npm run test:architecture/)
  assert.match(contributing, /asset provenance/i)
  assert.match(security, /private vulnerability reporting/i)
  assert.match(security, /scampanhoni@gmail\.com/)
  assert.match(codeowners, /\*\s+@Stefany-Campanhoni/)
  assert.match(pullRequest, /Etterna to osu!mania/)
  assert.match(pullRequest, /osu!mania to Etterna/)
  assert.match(bug, /sanitiz/i)
  assert.match(feature, /conversion direction/i)
  assert.match(issueConfig, /blank_issues_enabled:\s+false/)
  assert.match(releases, /categories:/)
})
