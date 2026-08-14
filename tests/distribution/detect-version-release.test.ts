import assert from "node:assert/strict"
import test from "node:test"
import { detectVersionRelease } from "../../.ci/release/detect-version-release.ts"

const stableChangelog = "# vsrg-skin-converter\n\n## 0.2.0\n\n### Minor Changes\n"

test("skips ordinary main pushes without a package version change", () => {
  assert.deepEqual(
    detectVersionRelease({
      previousVersion: "0.1.0-beta.1",
      packageVersion: "0.1.0-beta.1",
      lockVersion: "0.1.0-beta.1",
      changelog: "# vsrg-skin-converter\n",
    }),
    { shouldRelease: false },
  )
})

test("returns a stable release decision for a coherent SemVer bump", () => {
  assert.deepEqual(
    detectVersionRelease({
      previousVersion: "0.1.0",
      packageVersion: "0.2.0",
      lockVersion: "0.2.0",
      changelog: stableChangelog,
    }),
    {
      shouldRelease: true,
      version: "0.2.0",
      tag: "v0.2.0",
      prerelease: false,
    },
  )
})

test("marks a beta bump as a prerelease", () => {
  assert.deepEqual(
    detectVersionRelease({
      previousVersion: "0.2.0-beta.1",
      packageVersion: "0.2.0-beta.2",
      lockVersion: "0.2.0-beta.2",
      changelog: "# vsrg-skin-converter\n\n## 0.2.0-beta.2\n",
    }),
    {
      shouldRelease: true,
      version: "0.2.0-beta.2",
      tag: "v0.2.0-beta.2",
      prerelease: true,
    },
  )
})

test("rejects a package-lock version that differs from package.json", () => {
  assert.throws(
    () =>
      detectVersionRelease({
        previousVersion: "0.1.0",
        packageVersion: "0.2.0",
        lockVersion: "0.1.0",
        changelog: stableChangelog,
      }),
    /package-lock\.json version/i,
  )
})

test("rejects a non-increasing release version", () => {
  assert.throws(
    () =>
      detectVersionRelease({
        previousVersion: "0.2.0",
        packageVersion: "0.1.0",
        lockVersion: "0.1.0",
        changelog: "# vsrg-skin-converter\n\n## 0.1.0\n",
      }),
    /must be greater/i,
  )
})

test("rejects a release version missing from the changelog", () => {
  assert.throws(
    () =>
      detectVersionRelease({
        previousVersion: "0.1.0",
        packageVersion: "0.2.0",
        lockVersion: "0.2.0",
        changelog: "# vsrg-skin-converter\n",
      }),
    /changelog/i,
  )
})
