import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { buildApplication } from "../../.ci/release/build-application.ts"
import { bunRuntime, getReleasePaths } from "../../.ci/release/release-config.ts"
import { runCapturedSubprocess } from "../../.ci/runtime/run-subprocess.ts"
import packageJson from "../../package.json" with { type: "json" }

test("pins the official Bun 1.4.0 Windows x64 baseline runtime", () => {
  expect(bunRuntime).toStrictEqual({
    version: "1.4.0",
    revision: "34cbb9a40",
    archiveName: "bun-windows-x64-baseline.zip",
    archiveDirectoryName: "bun-windows-x64-baseline",
    sha256: "b929c54a9badb104a16dedd23aab6152c86793ae653d4e6b13983ffd0c882a66",
    executableSha256: "627d2e4775c24bdedee2cd7ccc18dcadae061e5345274ab6e3c4c797927bfb8f",
    url: "https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-windows-x64-baseline.zip",
  })
})

test("derives controlled build and release paths from an absolute project root", () => {
  const projectRoot = path.resolve("C:/repo")
  const paths = getReleasePaths(projectRoot, "1.0.0")

  expect(paths.projectRoot).toBe(projectRoot)
  expect(paths.packageDirectoryName).toBe("vsrg-skin-converter-v1.0.0-win-x64")
  expect(paths.bundlePath).toBe(path.join(projectRoot, "build", "app.mjs"))
  expect(paths.bunArchivePath).toBe(
    path.join(projectRoot, ".cache", "release", bunRuntime.archiveName),
  )
  expect(paths.unpackedPackageRoot).toBe(
    path.join(projectRoot, "build", "windows-portable", paths.packageDirectoryName),
  )
  expect(paths.zipPath).toBe(path.join(projectRoot, "release", `${paths.packageDirectoryName}.zip`))
  expect(paths.checksumPath).toBe(`${paths.zipPath}.sha256`)

  for (const controlledPath of [
    paths.buildRoot,
    paths.cacheRoot,
    paths.releaseRoot,
    paths.bundlePath,
    paths.bunArchivePath,
    paths.bunRuntimeRoot,
    paths.runtimeDependenciesRoot,
    paths.windowsBuildRoot,
    paths.unpackedPackageRoot,
    paths.zipPath,
    paths.checksumPath,
  ]) {
    expect(path.relative(projectRoot, controlledPath).startsWith("..")).toBe(false)
    expect(controlledPath).not.toBe(projectRoot)
  }
  expect(path.relative(paths.windowsBuildRoot, paths.zipPath).startsWith("..")).toBe(true)
})

test("rejects unsafe roots and versions", () => {
  expect(() => getReleasePaths("relative", "1.0.0")).toThrow(/absolute project root/i)
  expect(() => getReleasePaths(path.parse(process.cwd()).root, "1.0.0")).toThrow(/filesystem root/i)
  expect(() => getReleasePaths(process.cwd(), "")).toThrow(/version/i)
  expect(() => getReleasePaths(process.cwd(), "../escape")).toThrow(/version/i)
})

test("builds a Bun-targeted ESM application with Sharp external and no Node startup shim", async () => {
  const projectRoot = process.cwd()
  const temporaryRoot = await mkdtemp(path.join(projectRoot, ".tmp-bundle-"))
  const outputFile = path.join(temporaryRoot, "app.mjs")
  try {
    await buildApplication({
      entryPoint: path.join(projectRoot, "src", "cli.ts"),
      outputFile,
    })

    const bundle = await readFile(outputFile, "utf8")
    expect(bundle).toStartWith("// @bun")
    expect(bundle).toMatch(/from\s+["']sharp["']/)
    expect(bundle).not.toContain("globalThis.Bun ??=")
    const executable = Bun.argv[0]
    if (!executable) throw new Error("Could not determine the Bun executable")
    const result = await runCapturedSubprocess([executable, outputFile, "--version"], {
      cwd: os.tmpdir(),
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe(`${packageJson.version}\n`)
    expect(result.stderr).toBe("")
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
