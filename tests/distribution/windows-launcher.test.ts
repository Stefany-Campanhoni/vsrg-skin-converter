import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("pauses only a failed no-argument launch while preserving the application exit code", {
  skip: process.platform !== "win32",
}, async (context) => {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "Launcher Contract With Spaces "))
  context.after(() => rm(packageRoot, { recursive: true }))
  await mkdir(path.join(packageRoot, "runtime"))
  await copyFile(process.execPath, path.join(packageRoot, "runtime", "node.exe"))
  await copyFile(
    path.join(projectRoot, "distribution", "vsrg-skin-converter.cmd"),
    path.join(packageRoot, "vsrg-skin-converter.cmd"),
  )
  await writeFile(
    path.join(packageRoot, "app.mjs"),
    'process.stderr.write("application failed\\n"); process.exitCode = 7\n',
  )
  const launcher = path.join(packageRoot, "vsrg-skin-converter.cmd")

  const interactive = spawnSync(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", `""${launcher}" "`],
    {
      cwd: os.tmpdir(),
      encoding: "utf8",
      input: "x\n",
      windowsHide: true,
      windowsVerbatimArguments: true,
    },
  )
  assert.equal(interactive.status, 7)
  assert.match(interactive.stderr, /application failed/)
  assert.match(interactive.stderr, /exited with code 7/)
  assert.match(`${interactive.stdout}\n${interactive.stderr}`, /Press any key to continue/i)

  const argumentFailure = spawnSync(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", `""${launcher}" --invalid"`],
    {
      cwd: os.tmpdir(),
      encoding: "utf8",
      windowsHide: true,
      windowsVerbatimArguments: true,
    },
  )
  assert.equal(argumentFailure.status, 7)
  assert.match(argumentFailure.stderr, /exited with code 7/)
  assert.doesNotMatch(
    `${argumentFailure.stdout}\n${argumentFailure.stderr}`,
    /Press any key to continue/i,
  )
})
