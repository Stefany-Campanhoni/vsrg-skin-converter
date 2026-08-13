import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { buildApplication } from "../../scripts/release/build-application.ts"
import { getReleasePaths, nodeRuntime } from "../../scripts/release/release-config.ts"

const execFileAsync = promisify(execFile)

test("pins the supported Node Windows x64 runtime", () => {
  assert.deepEqual(nodeRuntime, {
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

  assert.equal(paths.projectRoot, projectRoot)
  assert.equal(paths.packageDirectoryName, "vsrg-skin-converter-v1.0.0-win-x64")
  assert.equal(paths.bundlePath, path.join(projectRoot, "build", "app.mjs"))
  assert.equal(
    paths.nodeArchivePath,
    path.join(projectRoot, ".cache", "release", nodeRuntime.archiveName),
  )
  assert.equal(
    paths.unpackedPackageRoot,
    path.join(projectRoot, "build", "windows-portable", paths.packageDirectoryName),
  )
  assert.equal(
    paths.zipPath,
    path.join(projectRoot, "release", `${paths.packageDirectoryName}.zip`),
  )
  assert.equal(paths.checksumPath, `${paths.zipPath}.sha256`)

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
    assert.equal(path.relative(projectRoot, controlledPath).startsWith(".."), false)
    assert.notEqual(controlledPath, projectRoot)
  }
  assert.equal(path.relative(paths.windowsBuildRoot, paths.zipPath).startsWith(".."), true)
})

test("rejects unsafe roots and versions", () => {
  assert.throws(() => getReleasePaths("relative", "1.0.0"), /absolute project root/i)
  assert.throws(() => getReleasePaths(path.parse(process.cwd()).root, "1.0.0"), /filesystem root/i)
  assert.throws(() => getReleasePaths(process.cwd(), ""), /version/i)
  assert.throws(() => getReleasePaths(process.cwd(), "../escape"), /version/i)
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
    assert.match(bundle, /from\s+["']sharp["']/)
    const { stdout, stderr } = await execFileAsync(process.execPath, [outputFile, "--version"], {
      cwd: os.tmpdir(),
    })
    assert.equal(stdout, "1.0.0\n")
    assert.equal(stderr, "")
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
