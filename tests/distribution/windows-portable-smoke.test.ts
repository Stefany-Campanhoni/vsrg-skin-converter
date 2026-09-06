import { expect, onTestFinished, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { acquireNodeRuntime } from "../../.ci/release/acquire-node-runtime.ts"
import { assembleWindowsPortable } from "../../.ci/release/assemble-windows-portable.ts"
import { buildApplication } from "../../.ci/release/build-application.ts"
import { installRuntimeDependencies } from "../../.ci/release/install-runtime-dependencies.ts"
import { getReleasePaths } from "../../.ci/release/release-config.ts"
import { verifyWindowsPortable } from "../../.ci/release/verify-windows-portable.ts"
import packageJson from "../../package.json" with { type: "json" }
import { concatBytes, decodeUtf8 } from "../support/bytes.ts"
import { expectTruthy } from "../support/expectations.ts"

interface LauncherResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number | null
  readonly timedOut: boolean
}

function runLauncher(
  launcher: string,
  args: readonly string[],
  cwd: string,
  timeoutMs = 10_000,
): Promise<LauncherResult> {
  return new Promise((resolve, reject) => {
    const command = `""${launcher.replaceAll("%", "%%")}" ${args.join(" ")}"`
    const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], {
      cwd,
      windowsHide: true,
      windowsVerbatimArguments: true,
    })
    const stdout: Uint8Array[] = []
    const stderr: Uint8Array[] = []
    child.stdout.on("data", (chunk: Uint8Array) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Uint8Array) => stderr.push(chunk))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.once("error", reject)
    child.once("exit", (code) => {
      clearTimeout(timer)
      resolve({
        stdout: decodeUtf8(concatBytes(stdout)),
        stderr: decodeUtf8(concatBytes(stderr)),
        code,
        timedOut,
      })
    })
  })
}

test("runs the real portable package from an external cwd and a path containing spaces", async () => {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
  const releasePaths = getReleasePaths(projectRoot, packageJson.version)
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "Portable Build With Spaces "))
  onTestFinished(() => rm(temporaryRoot, { recursive: true }))
  const packageRoot = path.join(temporaryRoot, releasePaths.packageDirectoryName)
  const bundlePath = path.join(temporaryRoot, "bundle", "app.mjs")
  const nodeExecutablePath = await acquireNodeRuntime({
    controlledRoot: releasePaths.cacheRoot,
    archivePath: releasePaths.nodeArchivePath,
    extractionRoot: releasePaths.nodeRuntimeRoot,
  })
  const runtimeNodeModulesPath = await installRuntimeDependencies({
    controlledRoot: temporaryRoot,
    sourcePackageDirectory: path.join(projectRoot, ".ci", "release", "runtime-package"),
    installationRoot: path.join(temporaryRoot, "runtime dependencies"),
  })
  await buildApplication({
    entryPoint: path.join(projectRoot, "src", "cli.ts"),
    outputFile: bundlePath,
  })
  const portable = await assembleWindowsPortable({
    controlledRoot: temporaryRoot,
    packageRoot,
    bundlePath,
    nodeExecutablePath,
    runtimeNodeModulesPath,
    templatesRoot: path.join(projectRoot, "src", "templates"),
    launcherPath: path.join(projectRoot, "distribution", "vsrg-skin-converter.cmd"),
    readmePath: path.join(projectRoot, "distribution", "README.txt"),
    noticesPath: path.join(projectRoot, "distribution", "THIRD-PARTY-NOTICES.txt"),
    licensePath: path.join(projectRoot, "LICENSE"),
  })

  const version = await runLauncher(portable.launcher, ["--version"], os.tmpdir())
  expect(version).toStrictEqual({
    stdout: `${packageJson.version}\n`,
    stderr: "",
    code: 0,
    timedOut: false,
  })
  const help = await runLauncher(portable.launcher, ["--help"], os.tmpdir())
  expect(help.code).toBe(0)
  expect(help.timedOut).toBe(false)
  expect(help.stdout).toMatch(/Usage: vsrg-skin-converter\.cmd/)
  expect(help.stderr).toBe("")
  const invalid = await runLauncher(portable.launcher, ["--unknown"], os.tmpdir(), 5_000)
  expect(invalid.timedOut).toBe(false)
  expect(invalid.code).toBe(1)
  expect(invalid.stderr).toMatch(/Unknown argument: --unknown/)
  expect(invalid.stderr).toMatch(/exited with code 1/)
  await verifyWindowsPortable({
    packageRoot,
    sourceTemplatesRoot: path.join(projectRoot, "src", "templates"),
    expectedVersion: packageJson.version,
  })
  expectTruthy((await readFile(path.join(packageRoot, "templates", "osu", "skin.ini"))).length > 0)
  expectTruthy(
    (await readFile(path.join(packageRoot, "templates", "etterna", "noteskin", "NoteSkin.lua")))
      .length > 0,
  )
}, 180_000)
