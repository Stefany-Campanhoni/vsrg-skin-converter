import { onTestFinished, test } from "bun:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

test.skipIf(process.platform !== "win32")("pauses a successful no-argument launch", async () => {
  const launcher = await createLauncherFixture('process.stdout.write("completed\\n")\n')

  const successful = spawnSync(
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

  assert.equal(successful.status, 0)
  assert.match(successful.stdout, /completed/)
  assert.match(`${successful.stdout}\n${successful.stderr}`, /Press any key to continue/i)
})

test.skipIf(process.platform !== "win32")(
  "pauses a failed no-argument launch while preserving the application exit code",
  async () => {
    const launcher = await createLauncherFixture(
      'process.stderr.write("application failed\\n"); process.exitCode = 7\n',
    )

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
  },
)

test.skipIf(process.platform !== "win32")(
  "does not pause when the first supplied argument is explicitly empty",
  async () => {
    const launcher = await createLauncherFixture(
      'process.stderr.write("application failed\\n"); process.exitCode = 7\n',
    )

    const argumentFailure = spawnSync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", `""${launcher}" "" --invalid"`],
      {
        cwd: os.tmpdir(),
        encoding: "utf8",
        windowsHide: true,
        windowsVerbatimArguments: true,
      },
    )

    assert.equal(argumentFailure.status, 7)
    assert.match(argumentFailure.stderr, /application failed/)
    assert.doesNotMatch(
      `${argumentFailure.stdout}\n${argumentFailure.stderr}`,
      /Press any key to continue/i,
    )
  },
)

test.skipIf(process.platform !== "win32")(
  "preserves the exit code for quoted metacharacter arguments without pausing",
  async () => {
    const launcher = await createLauncherFixture(
      'process.stderr.write("application failed\\n"); process.exitCode = 7\n',
    )

    for (const argument of ["&", "|"]) {
      const argumentFailure = spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `""${launcher}" "${argument}""`],
        {
          cwd: os.tmpdir(),
          encoding: "utf8",
          windowsHide: true,
          windowsVerbatimArguments: true,
        },
      )

      assert.equal(argumentFailure.status, 7, `argument ${argument}`)
      assert.match(argumentFailure.stderr, /application failed/)
      assert.doesNotMatch(
        `${argumentFailure.stdout}\n${argumentFailure.stderr}`,
        /Press any key to continue/i,
      )
    }
  },
)

async function createLauncherFixture(applicationSource: string): Promise<string> {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "Launcher Contract With Spaces "))
  onTestFinished(() => rm(packageRoot, { recursive: true }))
  await mkdir(path.join(packageRoot, "runtime"))
  await copyFile(process.execPath, path.join(packageRoot, "runtime", "node.exe"))
  await copyFile(
    path.join(projectRoot, "distribution", "vsrg-skin-converter.cmd"),
    path.join(packageRoot, "vsrg-skin-converter.cmd"),
  )
  await writeFile(path.join(packageRoot, "app.mjs"), applicationSource)
  return path.join(packageRoot, "vsrg-skin-converter.cmd")
}
