import { expect, test } from "bun:test"
import { detectVersionRelease } from "../../.ci/release/detect-version-release.ts"

const stableChangelog = "# vsrg-skin-converter\n\n## 0.2.0\n\n### Minor Changes\n"

test("skips ordinary main pushes without a package version change", () => {
  expect(
    detectVersionRelease({
      previousVersion: "0.1.0-beta.1",
      packageVersion: "0.1.0-beta.1",
      changelog: "# vsrg-skin-converter\n",
    }),
  ).toStrictEqual({ shouldRelease: false })
})

test("returns a stable release decision for a coherent SemVer bump", () => {
  expect(
    detectVersionRelease({
      previousVersion: "0.1.0",
      packageVersion: "0.2.0",
      changelog: stableChangelog,
    }),
  ).toStrictEqual({
    shouldRelease: true,
    version: "0.2.0",
    tag: "v0.2.0",
    prerelease: false,
  })
})

test("marks a beta bump as a prerelease", () => {
  expect(
    detectVersionRelease({
      previousVersion: "0.2.0-beta.1",
      packageVersion: "0.2.0-beta.2",
      changelog: "# vsrg-skin-converter\n\n## 0.2.0-beta.2\n",
    }),
  ).toStrictEqual({
    shouldRelease: true,
    version: "0.2.0-beta.2",
    tag: "v0.2.0-beta.2",
    prerelease: true,
  })
})

test("rejects a non-increasing release version", () => {
  expect(() =>
    detectVersionRelease({
      previousVersion: "0.2.0",
      packageVersion: "0.1.0",
      changelog: "# vsrg-skin-converter\n\n## 0.1.0\n",
    }),
  ).toThrow(/must be greater/i)
})

test("rejects a release version missing from the changelog", () => {
  expect(() =>
    detectVersionRelease({
      previousVersion: "0.1.0",
      packageVersion: "0.2.0",
      changelog: "# vsrg-skin-converter\n",
    }),
  ).toThrow(/changelog/i)
})
