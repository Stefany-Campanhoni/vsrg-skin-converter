import { expect, onTestFinished, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  copyFileContents,
  writeFileContents,
} from "../../src/infrastructure/filesystem/bun-file.ts"

test.skipIf(process.platform !== "win32")("pauses a successful no-argument launch", async () => {
  const launcher = await createLauncherFixture('process.stdout.write("completed\\n")\n')

  const successful = runLauncherCommand(`""${launcher}" "`, "x\n")

  expect(successful.status).toBe(0)
  expect(successful.stdout).toMatch(/completed/)
  expect(`${successful.stdout}\n${successful.stderr}`).toMatch(/Press any key to continue/i)
})

test.skipIf(process.platform !== "win32")(
  "pauses a failed no-argument launch while preserving the application exit code",
  async () => {
    const launcher = await createLauncherFixture(
      'process.stderr.write("application failed\\n"); process.exitCode = 7\n',
    )

    const interactive = runLauncherCommand(`""${launcher}" "`, "x\n")
    expect(interactive.status).toBe(7)
    expect(interactive.stderr).toMatch(/application failed/)
    expect(interactive.stderr).toMatch(/exited with code 7/)
    expect(`${interactive.stdout}\n${interactive.stderr}`).toMatch(/Press any key to continue/i)

    const argumentFailure = runLauncherCommand(`""${launcher}" --invalid"`)
    expect(argumentFailure.status).toBe(7)
    expect(argumentFailure.stderr).toMatch(/exited with code 7/)
    expect(`${argumentFailure.stdout}\n${argumentFailure.stderr}`).not.toMatch(
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

    const argumentFailure = runLauncherCommand(`""${launcher}" "" --invalid"`)

    expect(argumentFailure.status).toBe(7)
    expect(argumentFailure.stderr).toMatch(/application failed/)
    expect(`${argumentFailure.stdout}\n${argumentFailure.stderr}`).not.toMatch(
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
      const argumentFailure = runLauncherCommand(`""${launcher}" "${argument}""`)

      expect(argumentFailure.status, `argument ${argument}`).toBe(7)
      expect(argumentFailure.stderr).toMatch(/application failed/)
      expect(`${argumentFailure.stdout}\n${argumentFailure.stderr}`).not.toMatch(
        /Press any key to continue/i,
      )
    }
  },
)

function runLauncherCommand(
  command: string,
  input?: string,
): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const result = Bun.spawnSync({
    cmd: [Bun.env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", command],
    cwd: os.tmpdir(),
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    windowsVerbatimArguments: true,
  })
  const decoder = new TextDecoder()
  return {
    status: result.exitCode,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  }
}

async function createLauncherFixture(applicationSource: string): Promise<string> {
  const projectRoot = Bun.fileURLToPath(new URL("../../", import.meta.url))
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "Launcher Contract With Spaces "))
  onTestFinished(() => rm(packageRoot, { recursive: true }))
  await mkdir(path.join(packageRoot, "runtime"))
  const executable = Bun.argv[0]
  if (!executable) throw new Error("Could not determine the Bun executable")
  await copyFileContents(executable, path.join(packageRoot, "runtime", "node.exe"))
  await copyFileContents(
    path.join(projectRoot, "distribution", "vsrg-skin-converter.cmd"),
    path.join(packageRoot, "vsrg-skin-converter.cmd"),
  )
  await writeFileContents(path.join(packageRoot, "app.mjs"), applicationSource)
  return path.join(packageRoot, "vsrg-skin-converter.cmd")
}
