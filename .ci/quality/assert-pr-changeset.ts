import { runCapturedSubprocess } from "../runtime/run-subprocess.ts"

const releasePullRequestBranch = "changeset-release/main"
const dependabotLogin = "dependabot[bot]"

function isChangesetDocument(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/")
  return /^\.changeset\/[^/]+\.md$/i.test(normalized) && normalized !== ".changeset/README.md"
}

export function assertPullRequestHasChangeset(
  headRef: string,
  changedFiles: string[],
  pullRequestAuthor?: string,
): void {
  if (headRef === releasePullRequestBranch) return
  if (pullRequestAuthor === dependabotLogin) return
  if (changedFiles.some(isChangesetDocument)) return

  throw new Error(
    "Every pull request must include a Changeset. Run `npm run changeset` for a release or `npm run changeset -- --empty` for maintenance-only work.",
  )
}

function assertCommitSha(value: string, label: string): void {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`Expected a full ${label} SHA: ${value}`)
}

async function main(): Promise<void> {
  const [baseSha, headSha, headRef, pullRequestAuthor] = Bun.argv.slice(2)
  if (!baseSha || !headSha || !headRef) {
    throw new Error(
      "Usage: assert-pr-changeset.ts <base-sha> <head-sha> <head-ref> [pull-request-author]",
    )
  }
  assertCommitSha(baseSha, "base")
  assertCommitSha(headSha, "head")

  const result = await runCapturedSubprocess([
    "git",
    "diff",
    "--name-only",
    "--diff-filter=A",
    `${baseSha}...${headSha}`,
    "--",
    ".changeset",
  ])
  if (result.code !== 0) {
    throw new Error(
      `git diff exited with code ${result.code} and signal ${result.signal}: ${result.stderr.trim()}`,
    )
  }
  assertPullRequestHasChangeset(
    headRef,
    result.stdout.split(/\r?\n/u).filter(Boolean),
    pullRequestAuthor,
  )
}

if (import.meta.main) {
  await main()
}
