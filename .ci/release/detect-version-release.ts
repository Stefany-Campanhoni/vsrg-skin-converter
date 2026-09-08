import semver from "semver"
import { runCapturedSubprocess } from "../runtime/run-subprocess.ts"

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
  const [previousSha] = Bun.argv.slice(2)
  if (!previousSha) throw new Error("Usage: detect-version-release.ts <previous-main-sha>")
  assertPreviousSha(previousSha)

  const [previousPackageResult, currentPackage, currentLock, changelog] = await Promise.all([
    runCapturedSubprocess(["git", "show", `${previousSha}:package.json`]),
    Bun.file("package.json").text(),
    Bun.file("package-lock.json").text(),
    Bun.file("CHANGELOG.md").text(),
  ])
  if (previousPackageResult.code !== 0) {
    throw new Error(
      `git show exited with code ${previousPackageResult.code} and signal ${previousPackageResult.signal}: ${previousPackageResult.stderr.trim()}`,
    )
  }

  const decision = detectVersionRelease({
    previousVersion: readVersion(previousPackageResult.stdout, "previous package.json"),
    packageVersion: readVersion(currentPackage, "package.json"),
    lockVersion: readVersion(currentLock, "package-lock.json"),
    changelog,
  })
  await Bun.write(Bun.stdout, `${JSON.stringify(decision)}\n`)
}

if (import.meta.main) {
  await main()
}
