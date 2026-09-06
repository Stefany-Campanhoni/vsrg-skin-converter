import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { buildApplication } from "../../.ci/release/build-application.ts"
import { getReleasePaths, nodeRuntime } from "../../.ci/release/release-config.ts"
import { runCapturedSubprocess } from "../../.ci/runtime/run-subprocess.ts"
import packageJson from "../../package.json" with { type: "json" }

test("pins the supported Node Windows x64 runtime", () => {
  expect(nodeRuntime).toStrictEqual({
    version: "22.23.2",
    archiveName: "node-v22.23.2-win-x64.zip",
    sha256: "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97",
    executableSha256: "0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4",
    url: "https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip",
  })
})

test("derives controlled build and release paths from an absolute project root", () => {
  const projectRoot = path.resolve("C:/repo")
  const paths = getReleasePaths(projectRoot, "1.0.0")

  expect(paths.projectRoot).toBe(projectRoot)
  expect(paths.packageDirectoryName).toBe("vsrg-skin-converter-v1.0.0-win-x64")
  expect(paths.bundlePath).toBe(path.join(projectRoot, "build", "app.mjs"))
  expect(paths.nodeArchivePath).toBe(
    path.join(projectRoot, ".cache", "release", nodeRuntime.archiveName),
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
    paths.nodeArchivePath,
    paths.nodeRuntimeRoot,
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

test("builds an ESM application bundle with Sharp external and cwd-independent metadata", async () => {
  const projectRoot = process.cwd()
  const temporaryRoot = await mkdtemp(path.join(projectRoot, ".tmp-bundle-"))
  const outputFile = path.join(temporaryRoot, "app.mjs")
  try {
    await buildApplication({
      entryPoint: path.join(projectRoot, "src", "cli.ts"),
      outputFile,
    })

    const bundle = await readFile(outputFile, "utf8")
    expect(bundle).toMatch(/from\s+["']sharp["']/)
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
