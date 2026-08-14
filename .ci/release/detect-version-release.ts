import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import semver from "semver"

const execFileAsync = promisify(execFile)

export interface VersionReleaseInput {
  readonly previousVersion: string
  readonly packageVersion: string
  readonly lockVersion: string
  readonly changelog: string
}

export type VersionReleaseDecision =
  | { readonly shouldRelease: false }
  | {
      readonly shouldRelease: true
      readonly version: string
      readonly tag: string
      readonly prerelease: boolean
    }

function assertVersion(value: string, label: string): void {
  if (!semver.valid(value)) throw new Error(`Expected a valid ${label} SemVer version: ${value}`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function detectVersionRelease(input: VersionReleaseInput): VersionReleaseDecision {
  assertVersion(input.previousVersion, "previous package")
  assertVersion(input.packageVersion, "package.json")
  assertVersion(input.lockVersion, "package-lock.json")

  if (input.lockVersion !== input.packageVersion) {
    throw new Error(
      `package-lock.json version ${input.lockVersion} does not match package.json version ${input.packageVersion}`,
    )
  }
  if (input.packageVersion === input.previousVersion) return { shouldRelease: false }
  if (!semver.gt(input.packageVersion, input.previousVersion)) {
    throw new Error(
      `Release version ${input.packageVersion} must be greater than ${input.previousVersion}`,
    )
  }

  const changelogHeading = new RegExp(`^## ${escapeRegExp(input.packageVersion)}\\s*$`, "mu")
  if (!changelogHeading.test(input.changelog)) {
    throw new Error(`CHANGELOG.md does not contain a release section for ${input.packageVersion}`)
  }

  return {
    shouldRelease: true,
    version: input.packageVersion,
    tag: `v${input.packageVersion}`,
    prerelease: semver.prerelease(input.packageVersion) !== null,
  }
}

function readVersion(manifest: string, label: string): string {
  const parsed = JSON.parse(manifest) as { version?: unknown }
  if (typeof parsed.version !== "string") throw new Error(`${label} does not contain a version`)
  return parsed.version
}

function assertPreviousSha(value: string): void {
  if (!/^[0-9a-f]{40}$/i.test(value) || /^0+$/u.test(value)) {
    throw new Error(`Expected a non-zero previous main SHA: ${value}`)
  }
}

async function main(): Promise<void> {
  const [previousSha] = process.argv.slice(2)
  if (!previousSha) throw new Error("Usage: detect-version-release.ts <previous-main-sha>")
  assertPreviousSha(previousSha)

  const [{ stdout: previousPackage }, currentPackage, currentLock, changelog] = await Promise.all([
    execFileAsync("git", ["show", `${previousSha}:package.json`], { encoding: "utf8" }),
    readFile("package.json", "utf8"),
    readFile("package-lock.json", "utf8"),
    readFile("CHANGELOG.md", "utf8"),
  ])

  const decision = detectVersionRelease({
    previousVersion: readVersion(previousPackage, "previous package.json"),
    packageVersion: readVersion(currentPackage, "package.json"),
    lockVersion: readVersion(currentLock, "package-lock.json"),
    changelog,
  })
  process.stdout.write(`${JSON.stringify(decision)}\n`)
}

const entryPoint = process.argv[1]
if (entryPoint && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  await main()
}
