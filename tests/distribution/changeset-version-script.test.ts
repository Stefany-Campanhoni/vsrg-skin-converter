import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import packageJson from "../../package.json" with { type: "json" }

const execFileAsync = promisify(execFile)
const projectBinDirectory = fileURLToPath(new URL("../../node_modules/.bin/", import.meta.url))

async function runChangesetVersion(cwd: string): Promise<void> {
  const environment = {
    ...process.env,
    PATH: `${projectBinDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
  }

  if (process.platform === "win32") {
    await execFileAsync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", "npm run changeset:version"],
      {
        cwd,
        env: environment,
      },
    )
    return
  }

  await execFileAsync("npm", ["run", "changeset:version"], { cwd, env: environment })
}

async function readManifestVersion(filePath: string): Promise<string> {
  const manifest = JSON.parse(await readFile(filePath, "utf8")) as { readonly version?: unknown }
  if (typeof manifest.version !== "string") {
    assert.fail(`${filePath} does not contain a string version`)
  }
  return manifest.version
}

test("keeps the npm lockfile synchronized after Changesets versions the package", async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "vsrg-changeset-version-"))
  const packageName = "changeset-lockfile-fixture"

  try {
    await mkdir(path.join(fixtureRoot, ".changeset"))
    await Promise.all([
      writeFile(
        path.join(fixtureRoot, "package.json"),
        `${JSON.stringify(
          {
            name: packageName,
            version: "1.0.0",
            private: true,
            scripts: { "changeset:version": packageJson.scripts["changeset:version"] },
          },
          null,
          2,
        )}\n`,
      ),
      writeFile(
        path.join(fixtureRoot, "package-lock.json"),
        `${JSON.stringify(
          {
            name: packageName,
            version: "1.0.0",
            lockfileVersion: 3,
            requires: true,
            packages: { "": { name: packageName, version: "1.0.0" } },
          },
          null,
          2,
        )}\n`,
      ),
      writeFile(
        path.join(fixtureRoot, ".changeset", "config.json"),
        `${JSON.stringify(
          {
            changelog: false,
            commit: false,
            fixed: [],
            linked: [],
            access: "restricted",
            baseBranch: "main",
            updateInternalDependencies: "patch",
            ignore: [],
            privatePackages: { version: true, tag: false },
          },
          null,
          2,
        )}\n`,
      ),
      writeFile(
        path.join(fixtureRoot, ".changeset", "sync-lockfile.md"),
        `---\n"${packageName}": patch\n---\n\nExercise the version workflow.\n`,
      ),
    ])

    await runChangesetVersion(fixtureRoot)

    assert.equal(await readManifestVersion(path.join(fixtureRoot, "package.json")), "1.0.1")
    assert.equal(await readManifestVersion(path.join(fixtureRoot, "package-lock.json")), "1.0.1")
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
