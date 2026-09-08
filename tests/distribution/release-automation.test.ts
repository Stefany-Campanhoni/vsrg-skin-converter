import { expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import path from "node:path"
import packageJson from "../../package.json" with { type: "json" }

const setupBunAction = "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0"

function occurrenceCount(source: string, value: string): number {
  return source.split(value).length - 1
}

function workflowJob(source: string, name: string): string {
  const match = new RegExp(`^  ${name}:\\r?$`, "mu").exec(source)
  if (!match) throw new Error(`Workflow does not contain job ${name}`)
  const remainder = source.slice(match.index + match[0].length)
  const nextJobOffset = remainder.search(/^ {2}[a-z0-9_-]+:\r?$/mu)
  return nextJobOffset === -1 ? remainder : remainder.slice(0, nextJobOffset)
}

function powershellCommands(source: string, prefix: string): string[] {
  const lines = source.split(/\r?\n/u)
  const commands: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]?.trim() ?? ""
    if (!line.startsWith(prefix)) continue
    const parts: string[] = []
    do {
      const continued = line.endsWith("`")
      parts.push(continued ? line.slice(0, -1).trimEnd() : line)
      if (!continued) break
      index += 1
      line = lines[index]?.trim() ?? ""
    } while (line.length > 0)
    commands.push(parts.join(" "))
  }
  return commands
}

async function readWorkflows(): Promise<ReadonlyMap<string, string>> {
  const root = ".github/workflows"
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const workflows = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name).replaceAll("\\", "/")
    workflows.set(file, await Bun.file(file).text())
  }
  return workflows
}

test("keeps Changesets versioning on the pinned Bun toolchain", async () => {
  const workflow = await Bun.file(".github/workflows/changesets.yml").text()
  const releaseJob = workflowJob(workflow, "release-pr")

  expect(packageJson.packageManager).toBe(`bun@${packageJson.engines.bun}`)
  expect(occurrenceCount(releaseJob, `uses: ${setupBunAction}`)).toBe(1)
  expect(occurrenceCount(releaseJob, `bun-version: "${packageJson.engines.bun}"`)).toBe(1)
  expect(occurrenceCount(releaseJob, "run: bun ci")).toBe(1)
  expect(releaseJob).toContain("version-script: bun run changeset:version")
  expect(packageJson.scripts["changeset:version"]).toBe(
    "bunx --bun --no-install changeset version && bun install --lockfile-only",
  )
  expect(releaseJob).toContain("create-github-releases: false")
  expect(releaseJob).toContain("push-git-tags: false")
})

test("detects and builds draft releases only after reproducible Bun installs", async () => {
  const workflow = await Bun.file(".github/workflows/draft-release.yml").text()
  const installCommand = "run: bun ci"
  const detectorCommand = "bun .ci/release/detect-version-release.ts"
  const releaseCommand = "run: bun run release:windows"
  for (const [jobName, command] of [
    ["detect", detectorCommand],
    ["release", releaseCommand],
  ] as const) {
    const job = workflowJob(workflow, jobName)
    expect(occurrenceCount(job, `uses: ${setupBunAction}`)).toBe(1)
    expect(occurrenceCount(job, `bun-version: "${packageJson.engines.bun}"`)).toBe(1)
    expect(occurrenceCount(job, installCommand)).toBe(1)
    expect(job.indexOf(installCommand)).toBeLessThan(job.indexOf(command))
  }
})

test("publishes only the portable ZIP and checksum from every release workflow", async () => {
  const workflows = await readWorkflows()
  const releaseCommands: string[] = []
  for (const [file, source] of workflows) {
    expect(source.toLowerCase(), file).not.toContain("standalone")
    expect(source.toLowerCase(), file).not.toMatch(/\.exe\b/u)
    for (const prefix of ["gh release create", "gh release upload"] as const) {
      for (const command of powershellCommands(source, prefix)) {
        releaseCommands.push(`${file}: ${command}`)
      }
    }
  }

  expect(releaseCommands).toStrictEqual([
    ".github/workflows/draft-release.yml: gh release create $env:RELEASE_TAG $zip $checksum --draft --prerelease --target $env:GITHUB_SHA --title $env:RELEASE_TAG --generate-notes",
    ".github/workflows/draft-release.yml: gh release create $env:RELEASE_TAG $zip $checksum --draft --target $env:GITHUB_SHA --title $env:RELEASE_TAG --generate-notes",
  ])
})
