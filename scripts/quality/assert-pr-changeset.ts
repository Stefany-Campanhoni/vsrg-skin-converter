import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const releasePullRequestBranch = "changeset-release/main"

function isChangesetDocument(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/")
  return /^\.changeset\/[^/]+\.md$/i.test(normalized) && normalized !== ".changeset/README.md"
}

export function assertPullRequestHasChangeset(headRef: string, changedFiles: string[]): void {
  if (headRef === releasePullRequestBranch) return
  if (changedFiles.some(isChangesetDocument)) return

  throw new Error(
    "Every pull request must include a Changeset. Run `npm run changeset` for a release or `npm run changeset -- --empty` for maintenance-only work.",
  )
}

function assertCommitSha(value: string, label: string): void {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`Expected a full ${label} SHA: ${value}`)
}

async function main(): Promise<void> {
  const [baseSha, headSha, headRef] = process.argv.slice(2)
  if (!baseSha || !headSha || !headRef) {
    throw new Error("Usage: assert-pr-changeset.ts <base-sha> <head-sha> <head-ref>")
  }
  assertCommitSha(baseSha, "base")
  assertCommitSha(headSha, "head")

  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", "--diff-filter=A", `${baseSha}...${headSha}`, "--", ".changeset"],
    { encoding: "utf8" },
  )
  assertPullRequestHasChangeset(headRef, stdout.split(/\r?\n/u).filter(Boolean))
}

const entryPoint = process.argv[1]
if (entryPoint && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  await main()
}
