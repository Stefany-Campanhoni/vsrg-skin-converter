import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
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
    controlledRoot: root,
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
    controlledRoot: fixture.controlledRoot,
    archivePath: fixture.archivePath,
    extractionRoot: fixture.extractionRoot,
    dependencies: {
      token: () => "test",
      downloadFile: async (url, destination) => {
        events.push(["download", url, destination])
        await writeFile(destination, "archive")
      },
      hashFile: async (file) => {
        const digest = file.endsWith("node.exe") ? nodeRuntime.executableSha256 : nodeRuntime.sha256
        events.push(["hash", file, digest])
        return digest
      },
      readNodeVersion: async (file) => {
        events.push(["version", file, `v${nodeRuntime.version}`])
        return `v${nodeRuntime.version}`
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
    [
      "hash",
      path.join(
        `${fixture.extractionRoot}.test.extract`,
        path.basename(fixture.extractionRoot),
        "node.exe",
      ),
      nodeRuntime.executableSha256,
    ],
    [
      "version",
      path.join(
        `${fixture.extractionRoot}.test.extract`,
        path.basename(fixture.extractionRoot),
        "node.exe",
      ),
      `v${nodeRuntime.version}`,
    ],
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
  await writeFile(
    path.join(fixture.extractionRoot, ".vsrg-runtime-verification.json"),
    `${JSON.stringify({
      archiveSha256: nodeRuntime.sha256,
      nodeExecutableSha256: nodeRuntime.executableSha256,
      nodeVersion: nodeRuntime.version,
    })}\n`,
  )
  const hashed: string[] = []

  const result = await acquireNodeRuntime({
    controlledRoot: fixture.controlledRoot,
    archivePath: fixture.archivePath,
    extractionRoot: fixture.extractionRoot,
    dependencies: {
      hashFile: async (file) => {
        hashed.push(file)
        return file.endsWith("node.exe") ? nodeRuntime.executableSha256 : nodeRuntime.sha256
      },
      readNodeVersion: async () => `v${nodeRuntime.version}`,
      downloadFile: async () => assert.fail("cached archive must not be downloaded again"),
      extractArchive: async () => assert.fail("valid extraction must be reused"),
    },
  })

  assert.equal(result, path.join(fixture.extractionRoot, "node.exe"))
  assert.deepEqual(hashed, [fixture.archivePath, path.join(fixture.extractionRoot, "node.exe")])
})

test("rejects a mismatched archive without extracting it", async (context) => {
  const fixture = await runtimeFixture()
  context.after(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  let extracted = false

  await assert.rejects(
    acquireNodeRuntime({
      controlledRoot: fixture.controlledRoot,
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
      controlledRoot: fixture.controlledRoot,
      archivePath: fixture.archivePath,
      extractionRoot: fixture.extractionRoot,
      dependencies: {
        token: () => "missing",
        hashFile: async () => nodeRuntime.sha256,
        readNodeVersion: async () => `v${nodeRuntime.version}`,
        extractArchive: async () => undefined,
      },
    }),
    new RegExp(
      path
        .join(
          `${fixture.extractionRoot}.missing.extract`,
          path.basename(fixture.extractionRoot),
          "node.exe",
        )
        .replaceAll("\\", "\\\\"),
    ),
  )
})

for (const staleCase of [
  "missing stamp",
  "stale archive stamp",
  "stale version stamp",
  "tampered node.exe",
  "wrong node version",
] as const) {
  test(`reextracts a cached runtime with ${staleCase}`, async (context) => {
    const fixture = await runtimeFixture()
    context.after(() => rm(fixture.root, { recursive: true }))
    await writeFile(fixture.archivePath, "cached archive")
    await mkdir(fixture.extractionRoot)
    await writeFile(path.join(fixture.extractionRoot, "node.exe"), "cached node")
    if (staleCase !== "missing stamp") {
      await writeFile(
        path.join(fixture.extractionRoot, ".vsrg-runtime-verification.json"),
        `${JSON.stringify({
          archiveSha256: staleCase === "stale archive stamp" ? "0".repeat(64) : nodeRuntime.sha256,
          nodeExecutableSha256: nodeRuntime.executableSha256,
          nodeVersion: staleCase === "stale version stamp" ? "0.0.0" : nodeRuntime.version,
        })}\n`,
      )
    }
    let extractionCount = 0

    const result = await acquireNodeRuntime({
      ...fixture,
      dependencies: {
        token: () => "refresh",
        downloadFile: async () => assert.fail("verified cached archive must be reused"),
        hashFile: async (file) => {
          if (file === fixture.archivePath) return nodeRuntime.sha256
          const contents = await readFile(file, "utf8")
          if (contents === "fresh node" || staleCase !== "tampered node.exe") {
            return nodeRuntime.executableSha256
          }
          return "1".repeat(64)
        },
        readNodeVersion: async (file) => {
          const contents = await readFile(file, "utf8")
          if (contents === "cached node" && staleCase === "wrong node version") return "v0.0.0"
          return `v${nodeRuntime.version}`
        },
        extractArchive: async (_archive, destination) => {
          extractionCount += 1
          const extractedRoot = path.join(destination, path.basename(fixture.extractionRoot))
          await mkdir(extractedRoot, { recursive: true })
          await writeFile(path.join(extractedRoot, "node.exe"), "fresh node")
        },
      },
    })

    assert.equal(result, path.join(fixture.extractionRoot, "node.exe"))
    assert.equal(extractionCount, 1)
    assert.equal(await readFile(result, "utf8"), "fresh node")
  })
}

test("rejects acquire paths outside the explicit controlled root before mutation", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-ownership-test-"))
  context.after(() => rm(root, { recursive: true }))
  const controlledRoot = path.join(root, "controlled")
  const archivePath = path.join(root, "outside", nodeRuntime.archiveName)
  const extractionRoot = path.join(root, "outside", `node-v${nodeRuntime.version}-win-x64`)
  let mutated = false
  let callbackInvoked = false

  await assert.rejects(
    acquireNodeRuntime({
      controlledRoot,
      archivePath,
      extractionRoot,
      dependencies: {
        token: () => {
          callbackInvoked = true
          return "outside"
        },
        downloadFile: async () => {
          mutated = true
        },
        hashFile: async () => {
          mutated = true
          return nodeRuntime.sha256
        },
        extractArchive: async () => {
          mutated = true
        },
      },
    }),
    /controlled root/i,
  )

  assert.equal(mutated, false)
  assert.equal(callbackInvoked, false)
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
    controlledRoot: root,
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
        controlledRoot: root,
        sourcePackageDirectory,
        installationRoot,
        dependencies: {
          token: () => missing.replace("@", ""),
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
      controlledRoot: root,
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

for (const failedBoundary of ["backup runtime", "publish runtime"] as const) {
  test(`restores the previous runtime installation when ${failedBoundary} rename fails`, async (context) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-install-rollback-test-"))
    context.after(() => rm(root, { recursive: true }))
    const sourcePackageDirectory = path.join(root, "source")
    const controlledRoot = path.join(root, "controlled")
    const installationRoot = path.join(controlledRoot, "installed")
    const token = failedBoundary.replace(" ", "-")
    const stagingRoot = `${installationRoot}.${token}.staging`
    const backupRoot = `${installationRoot}.${token}.backup`
    await mkdir(sourcePackageDirectory)
    await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
    await writeFile(path.join(sourcePackageDirectory, "package-lock.json"), "{}")
    await mkdir(installationRoot, { recursive: true })
    await writeFile(path.join(installationRoot, "previous.txt"), "verified")
    const cause = new Error(`failed ${failedBoundary}`)

    await assert.rejects(
      installRuntimeDependencies({
        controlledRoot,
        sourcePackageDirectory,
        installationRoot,
        dependencies: {
          token: () => token,
          delay: async () => {},
          runCommand: async ({ cwd }) => {
            await mkdir(path.join(cwd, "node_modules", "sharp"), { recursive: true })
            await mkdir(path.join(cwd, "node_modules", "@img"), { recursive: true })
          },
          renamePath: async (source, destination) => {
            const boundary =
              source === installationRoot && destination === backupRoot
                ? "backup runtime"
                : source === stagingRoot && destination === installationRoot
                  ? "publish runtime"
                  : undefined
            if (boundary === failedBoundary) throw cause
            await rename(source, destination)
          },
        },
      }),
      (error: unknown) => error === cause,
    )

    assert.equal(await readFile(path.join(installationRoot, "previous.txt"), "utf8"), "verified")
  })
}

test("retains the runtime recovery backup when restoration fails", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-install-recovery-test-"))
  context.after(() => rm(root, { recursive: true }))
  const sourcePackageDirectory = path.join(root, "source")
  const controlledRoot = path.join(root, "controlled")
  const installationRoot = path.join(controlledRoot, "installed")
  const token = "recovery"
  const stagingRoot = `${installationRoot}.${token}.staging`
  const backupRoot = `${installationRoot}.${token}.backup`
  await mkdir(sourcePackageDirectory)
  await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
  await writeFile(path.join(sourcePackageDirectory, "package-lock.json"), "{}")
  await mkdir(installationRoot, { recursive: true })
  await writeFile(path.join(installationRoot, "previous.txt"), "verified")
  const promotionCause = new Error("runtime promotion failed")
  const restorationCause = new Error("runtime restoration failed")

  await assert.rejects(
    installRuntimeDependencies({
      controlledRoot,
      sourcePackageDirectory,
      installationRoot,
      dependencies: {
        token: () => token,
        delay: async () => {},
        runCommand: async ({ cwd }) => {
          await mkdir(path.join(cwd, "node_modules", "sharp"), { recursive: true })
          await mkdir(path.join(cwd, "node_modules", "@img"), { recursive: true })
        },
        renamePath: async (source, destination) => {
          if (source === stagingRoot && destination === installationRoot) throw promotionCause
          if (source === backupRoot && destination === installationRoot) throw restorationCause
          await rename(source, destination)
        },
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError)
      assert.equal(error.cause, promotionCause)
      assert.deepEqual(error.errors, [promotionCause, restorationCause])
      return true
    },
  )

  assert.equal(await readFile(path.join(backupRoot, "previous.txt"), "utf8"), "verified")
})

test("rejects runtime installation outside the explicit controlled root before mutation", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-install-ownership-test-"))
  context.after(() => rm(root, { recursive: true }))
  const sourcePackageDirectory = path.join(root, "source")
  await mkdir(sourcePackageDirectory)
  await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
  await writeFile(path.join(sourcePackageDirectory, "package-lock.json"), "{}")
  let commandRan = false
  let callbackInvoked = false

  await assert.rejects(
    installRuntimeDependencies({
      controlledRoot: path.join(root, "controlled"),
      sourcePackageDirectory,
      installationRoot: path.join(root, "outside", "installed"),
      dependencies: {
        token: () => {
          callbackInvoked = true
          return "outside"
        },
        runCommand: async () => {
          commandRan = true
        },
      },
    }),
    /controlled root/i,
  )

  assert.equal(commandRan, false)
  assert.equal(callbackInvoked, false)
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
