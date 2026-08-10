import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { acquireNodeRuntime } from "../../scripts/release/acquire-node-runtime.ts"
import {
  installRuntimeDependencies,
  runRuntimeCommand,
} from "../../scripts/release/install-runtime-dependencies.ts"
import { nodeRuntime } from "../../scripts/release/release-config.ts"

async function runtimeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-test-"))
  return {
    root,
    archivePath: path.join(root, nodeRuntime.archiveName),
    extractionRoot: path.join(root, `node-v${nodeRuntime.version}-win-x64`),
  }
}

test("downloads once, verifies the pinned hash, and returns node.exe", async (context) => {
  const fixture = await runtimeFixture()
  context.after(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  const events: unknown[] = []

  const result = await acquireNodeRuntime({
    archivePath: fixture.archivePath,
    extractionRoot: fixture.extractionRoot,
    dependencies: {
      token: () => "test",
      downloadFile: async (url, destination) => {
        events.push(["download", url, destination])
        await writeFile(destination, "archive")
      },
      hashFile: async (file) => {
        events.push(["hash", file, nodeRuntime.sha256])
        return nodeRuntime.sha256
      },
      extractArchive: async (archive, destination) => {
        events.push(["extract", archive, destination])
        const runtime = path.join(destination, path.basename(fixture.extractionRoot))
        await mkdir(runtime, { recursive: true })
        await writeFile(path.join(runtime, "node.exe"), "node")
      },
    },
  })

  assert.equal(result, path.join(fixture.extractionRoot, "node.exe"))
  assert.deepEqual(events, [
    ["download", nodeRuntime.url, `${fixture.archivePath}.test.tmp`],
    ["hash", `${fixture.archivePath}.test.tmp`, nodeRuntime.sha256],
    ["extract", fixture.archivePath, `${fixture.extractionRoot}.test.extract`],
  ])
})

test("reuses a cached archive only after verifying its hash", async (context) => {
  const fixture = await runtimeFixture()
  context.after(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  await writeFile(fixture.archivePath, "cached")
  await mkdir(fixture.extractionRoot)
  await writeFile(path.join(fixture.extractionRoot, "node.exe"), "node")
  const hashed: string[] = []

  const result = await acquireNodeRuntime({
    archivePath: fixture.archivePath,
    extractionRoot: fixture.extractionRoot,
    dependencies: {
      hashFile: async (file) => {
        hashed.push(file)
        return nodeRuntime.sha256
      },
      downloadFile: async () => assert.fail("cached archive must not be downloaded again"),
      extractArchive: async () => assert.fail("valid extraction must be reused"),
    },
  })

  assert.equal(result, path.join(fixture.extractionRoot, "node.exe"))
  assert.deepEqual(hashed, [fixture.archivePath])
})

test("rejects a mismatched archive without extracting it", async (context) => {
  const fixture = await runtimeFixture()
  context.after(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  let extracted = false

  await assert.rejects(
    acquireNodeRuntime({
      archivePath: fixture.archivePath,
      extractionRoot: fixture.extractionRoot,
      dependencies: {
        token: () => "bad",
        downloadFile: async (_url, destination) => writeFile(destination, "corrupt"),
        hashFile: async () => "0".repeat(64),
        extractArchive: async () => {
          extracted = true
        },
      },
    }),
    new RegExp(`${nodeRuntime.sha256}.*${"0".repeat(64)}`, "i"),
  )
  assert.equal(extracted, false)
})

test("rejects an extracted runtime without the regular node.exe file", async (context) => {
  const fixture = await runtimeFixture()
  context.after(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  await writeFile(fixture.archivePath, "cached")

  await assert.rejects(
    acquireNodeRuntime({
      archivePath: fixture.archivePath,
      extractionRoot: fixture.extractionRoot,
      dependencies: {
        token: () => "missing",
        hashFile: async () => nodeRuntime.sha256,
        extractArchive: async () => undefined,
      },
    }),
    new RegExp(path.join(fixture.extractionRoot, "node.exe").replaceAll("\\", "\\\\")),
  )
})

test("installs the isolated Windows x64 Sharp dependency tree", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-sharp-test-"))
  context.after(async () => (await import("node:fs/promises")).rm(root, { recursive: true }))
  const sourcePackageDirectory = path.join(root, "source")
  const installationRoot = path.join(root, "installed")
  await mkdir(sourcePackageDirectory)
  await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
  await writeFile(path.join(sourcePackageDirectory, "package-lock.json"), "{}")
  let command: unknown

  const result = await installRuntimeDependencies({
    sourcePackageDirectory,
    installationRoot,
    dependencies: {
      token: () => "test",
      runCommand: async (value) => {
        command = value
        await mkdir(path.join(value.cwd, "node_modules", "sharp"), { recursive: true })
        await mkdir(path.join(value.cwd, "node_modules", "@img"), { recursive: true })
      },
    },
  })

  assert.deepEqual(command, {
    executable: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["ci", "--omit=dev", "--os=win32", "--cpu=x64"],
    cwd: `${installationRoot}.test.staging`,
  })
  assert.equal(result, path.join(installationRoot, "node_modules"))
})

test("rejects missing Sharp runtime trees and retains the command failure cause", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-sharp-failure-test-"))
  context.after(async () => (await import("node:fs/promises")).rm(root, { recursive: true }))
  const sourcePackageDirectory = path.join(root, "source")
  await mkdir(sourcePackageDirectory)
  await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
  await writeFile(path.join(sourcePackageDirectory, "package-lock.json"), "{}")

  for (const missing of ["sharp", "@img"] as const) {
    const installationRoot = path.join(root, `missing-${missing.replace("@", "")}`)
    await assert.rejects(
      installRuntimeDependencies({
        sourcePackageDirectory,
        installationRoot,
        dependencies: {
          token: () => missing,
          runCommand: async ({ cwd }) => {
            const present = missing === "sharp" ? "@img" : "sharp"
            await mkdir(path.join(cwd, "node_modules", present), { recursive: true })
          },
        },
      }),
      new RegExp(`node_modules[\\\\/]${missing.replace("@", "@")}`),
    )
  }

  const cause = new Error("npm exploded")
  await assert.rejects(
    installRuntimeDependencies({
      sourcePackageDirectory,
      installationRoot: path.join(root, "command-failure"),
      dependencies: {
        token: () => "failure",
        runCommand: async () => {
          throw cause
        },
      },
    }),
    (error: unknown) => error instanceof Error && error.cause === cause,
  )
})

test("executes the npm command wrapper on Windows without spawn EINVAL", {
  skip: process.platform !== "win32",
}, async () => {
  await runRuntimeCommand({
    executable: "npm.cmd",
    args: ["--version"],
    cwd: process.cwd(),
  })
})
