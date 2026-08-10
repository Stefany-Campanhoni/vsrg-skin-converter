import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { acquireNodeRuntime } from "../../scripts/release/acquire-node-runtime.ts"
import { assembleWindowsPortable } from "../../scripts/release/assemble-windows-portable.ts"
import { buildApplication } from "../../scripts/release/build-application.ts"
import { installRuntimeDependencies } from "../../scripts/release/install-runtime-dependencies.ts"
import { getReleasePaths } from "../../scripts/release/release-config.ts"
import { verifyWindowsPortable } from "../../scripts/release/verify-windows-portable.ts"

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
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.once("error", reject)
    child.once("exit", (code) => {
      clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        code,
        timedOut,
      })
    })
  })
}

test("runs the real portable package from an external cwd and a path containing spaces", {
  timeout: 180_000,
}, async (context) => {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
  const releasePaths = getReleasePaths(projectRoot, "1.0.0")
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "Portable Build With Spaces "))
  context.after(() => rm(temporaryRoot, { recursive: true }))
  const packageRoot = path.join(temporaryRoot, releasePaths.packageDirectoryName)
  const bundlePath = path.join(temporaryRoot, "bundle", "app.mjs")
  const nodeExecutablePath = await acquireNodeRuntime({
    archivePath: releasePaths.nodeArchivePath,
    extractionRoot: releasePaths.nodeRuntimeRoot,
  })
  const runtimeNodeModulesPath = await installRuntimeDependencies({
    sourcePackageDirectory: path.join(projectRoot, "scripts", "release", "runtime-package"),
    installationRoot: path.join(temporaryRoot, "runtime dependencies"),
  })
  await buildApplication({
    entryPoint: path.join(projectRoot, "src", "cli.ts"),
    outputFile: bundlePath,
  })
  const portable = await assembleWindowsPortable({
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
  assert.deepEqual(version, { stdout: "1.0.0\n", stderr: "", code: 0, timedOut: false })
  const help = await runLauncher(portable.launcher, ["--help"], os.tmpdir())
  assert.equal(help.code, 0)
  assert.equal(help.timedOut, false)
  assert.match(help.stdout, /Usage: vsrg-skin-converter\.cmd/)
  assert.equal(help.stderr, "")
  const invalid = await runLauncher(portable.launcher, ["--unknown"], os.tmpdir(), 5_000)
  assert.equal(invalid.timedOut, false)
  assert.equal(invalid.code, 1)
  assert.match(invalid.stderr, /Unknown argument: --unknown/)
  assert.match(invalid.stderr, /exited with code 1/)
  await verifyWindowsPortable({
    packageRoot,
    sourceTemplatesRoot: path.join(projectRoot, "src", "templates"),
    expectedVersion: "1.0.0",
  })
  assert.ok((await readFile(path.join(packageRoot, "templates", "osu", "skin.ini"))).length > 0)
  assert.ok(
    (await readFile(path.join(packageRoot, "templates", "etterna", "noteskin", "NoteSkin.lua")))
      .length > 0,
  )
})
