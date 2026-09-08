import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { runInheritedSubprocess } from "../../.ci/runtime/run-subprocess.ts"
import packageJson from "../../package.json" with { type: "json" }

async function runBun(cwd: string, args: readonly string[]): Promise<void> {
  const executable = Bun.argv[0]
  if (!executable) throw new Error("Could not determine the Bun executable")
  const result = await runInheritedSubprocess([executable, ...args], { cwd })
  if (result.code !== 0) {
    throw new Error(`Bun command exited with code ${result.code} and signal ${result.signal}`)
  }
}

async function readManifestVersion(filePath: string): Promise<string> {
  const manifest = JSON.parse(await readFile(filePath, "utf8")) as { readonly version?: unknown }
  if (typeof manifest.version !== "string") {
    ;(() => {
      throw new Error(`${filePath} does not contain a string version`)
    })()
  }
  return manifest.version
}

test("refreshes the Bun lockfile after Changesets versions the package", async () => {
  const fixtureParent = path.resolve(".tmp")
  await mkdir(fixtureParent, { recursive: true })
  const fixtureRoot = await mkdtemp(path.join(fixtureParent, "vsrg-changeset-version-"))
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
            dependencies: { semver: "7.8.5" },
            scripts: { "changeset:version": packageJson.scripts["changeset:version"] },
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

    await runBun(fixtureRoot, ["install", "--lockfile-only", "--ignore-scripts"])
    await runBun(fixtureRoot, ["run", "changeset:version"])

    expect(await readManifestVersion(path.join(fixtureRoot, "package.json"))).toBe("1.0.1")
    expect(await Bun.file(path.join(fixtureRoot, "bun.lock")).exists()).toBe(true)
    await runBun(fixtureRoot, ["ci", "--ignore-scripts"])
    expect(await Bun.file(path.join(fixtureRoot, "package-" + "lock.json")).exists()).toBe(false)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
