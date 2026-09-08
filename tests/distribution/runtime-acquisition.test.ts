import { expect, onTestFinished, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireBunRuntime } from "../../.ci/release/acquire-bun-runtime.ts"
import {
  installRuntimeDependencies,
  runRuntimeCommand,
} from "../../.ci/release/install-runtime-dependencies.ts"
import { bunRuntime } from "../../.ci/release/release-config.ts"
import { expectRejectionSatisfies, expectTruthy } from "../support/expectations.ts"

async function runtimeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-test-"))
  return {
    root,
    controlledRoot: root,
    archivePath: path.join(root, bunRuntime.archiveName),
    extractionRoot: path.join(root, `bun-v${bunRuntime.version}-windows-x64-baseline`),
  }
}

test("downloads once, verifies the pinned hash, and returns bun.exe", async () => {
  const fixture = await runtimeFixture()
  onTestFinished(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  const events: unknown[] = []

  const result = await acquireBunRuntime({
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
        const digest = file.endsWith("bun.exe") ? bunRuntime.executableSha256 : bunRuntime.sha256
        events.push(["hash", file, digest])
        return digest
      },
      readBunVersion: async (file) => {
        events.push(["version", file, bunRuntime.version])
        return bunRuntime.version
      },
      readBunRevision: async (file) => {
        const revision = `${bunRuntime.version}+${bunRuntime.revision}`
        events.push(["revision", file, revision])
        return revision
      },
      extractArchive: async (archive, destination) => {
        events.push(["extract", archive, destination])
        const runtime = path.join(destination, bunRuntime.archiveDirectoryName)
        await mkdir(runtime, { recursive: true })
        await writeFile(path.join(runtime, "bun.exe"), "bun")
      },
    },
  })

  expect(result).toBe(path.join(fixture.extractionRoot, "bun.exe"))
  expect(events).toStrictEqual([
    ["download", bunRuntime.url, `${fixture.archivePath}.test.tmp`],
    ["hash", `${fixture.archivePath}.test.tmp`, bunRuntime.sha256],
    ["extract", fixture.archivePath, `${fixture.extractionRoot}.test.extract`],
    [
      "hash",
      path.join(
        `${fixture.extractionRoot}.test.extract`,
        bunRuntime.archiveDirectoryName,
        "bun.exe",
      ),
      bunRuntime.executableSha256,
    ],
    [
      "version",
      path.join(
        `${fixture.extractionRoot}.test.extract`,
        bunRuntime.archiveDirectoryName,
        "bun.exe",
      ),
      bunRuntime.version,
    ],
    [
      "revision",
      path.join(
        `${fixture.extractionRoot}.test.extract`,
        bunRuntime.archiveDirectoryName,
        "bun.exe",
      ),
      `${bunRuntime.version}+${bunRuntime.revision}`,
    ],
  ])
})

test("reuses a cached archive only after verifying its hash", async () => {
  const fixture = await runtimeFixture()
  onTestFinished(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  await writeFile(fixture.archivePath, "cached")
  await mkdir(fixture.extractionRoot)
  await writeFile(path.join(fixture.extractionRoot, "bun.exe"), "bun")
  await writeFile(
    path.join(fixture.extractionRoot, ".vsrg-runtime-verification.json"),
    `${JSON.stringify({
      archiveSha256: bunRuntime.sha256,
      bunExecutableSha256: bunRuntime.executableSha256,
      bunVersion: bunRuntime.version,
      bunRevision: bunRuntime.revision,
    })}\n`,
  )
  const hashed: string[] = []

  const result = await acquireBunRuntime({
    controlledRoot: fixture.controlledRoot,
    archivePath: fixture.archivePath,
    extractionRoot: fixture.extractionRoot,
    dependencies: {
      hashFile: async (file) => {
        hashed.push(file)
        return file.endsWith("bun.exe") ? bunRuntime.executableSha256 : bunRuntime.sha256
      },
      readBunVersion: async () => bunRuntime.version,
      readBunRevision: async () => `${bunRuntime.version}+${bunRuntime.revision}`,
      downloadFile: async () =>
        (() => {
          throw new Error("cached archive must not be downloaded again")
        })(),
      extractArchive: async () =>
        (() => {
          throw new Error("valid extraction must be reused")
        })(),
    },
  })

  expect(result).toBe(path.join(fixture.extractionRoot, "bun.exe"))
  expect(hashed).toStrictEqual([fixture.archivePath, path.join(fixture.extractionRoot, "bun.exe")])
})

test("rejects a mismatched archive without extracting it", async () => {
  const fixture = await runtimeFixture()
  onTestFinished(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  let extracted = false

  await expect(
    acquireBunRuntime({
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
  ).rejects.toThrow(new RegExp(`${bunRuntime.sha256}.*${"0".repeat(64)}`, "i"))
  expect(extracted).toBe(false)
})

test("rejects an extracted runtime without the regular bun.exe file", async () => {
  const fixture = await runtimeFixture()
  onTestFinished(async () =>
    (await import("node:fs/promises")).rm(fixture.root, { recursive: true }),
  )
  await writeFile(fixture.archivePath, "cached")

  await expect(
    acquireBunRuntime({
      controlledRoot: fixture.controlledRoot,
      archivePath: fixture.archivePath,
      extractionRoot: fixture.extractionRoot,
      dependencies: {
        token: () => "missing",
        hashFile: async () => bunRuntime.sha256,
        readBunVersion: async () => bunRuntime.version,
        readBunRevision: async () => `${bunRuntime.version}+${bunRuntime.revision}`,
        extractArchive: async () => undefined,
      },
    }),
  ).rejects.toThrow(
    new RegExp(
      path
        .join(
          `${fixture.extractionRoot}.missing.extract`,
          bunRuntime.archiveDirectoryName,
          "bun.exe",
        )
        .replaceAll("\\", "\\\\"),
    ),
  )
})

for (const staleCase of [
  "missing stamp",
  "stale archive stamp",
  "stale version stamp",
  "stale revision stamp",
  "tampered bun.exe",
  "wrong bun version",
  "wrong bun revision",
] as const) {
  test(`reextracts a cached runtime with ${staleCase}`, async () => {
    const fixture = await runtimeFixture()
    onTestFinished(() => rm(fixture.root, { recursive: true }))
    await writeFile(fixture.archivePath, "cached archive")
    await mkdir(fixture.extractionRoot)
    await writeFile(path.join(fixture.extractionRoot, "bun.exe"), "cached bun")
    if (staleCase !== "missing stamp") {
      await writeFile(
        path.join(fixture.extractionRoot, ".vsrg-runtime-verification.json"),
        `${JSON.stringify({
          archiveSha256: staleCase === "stale archive stamp" ? "0".repeat(64) : bunRuntime.sha256,
          bunExecutableSha256: bunRuntime.executableSha256,
          bunVersion: staleCase === "stale version stamp" ? "0.0.0" : bunRuntime.version,
          bunRevision: staleCase === "stale revision stamp" ? "000000000" : bunRuntime.revision,
        })}\n`,
      )
    }
    let extractionCount = 0

    const result = await acquireBunRuntime({
      ...fixture,
      dependencies: {
        token: () => "refresh",
        downloadFile: async () =>
          (() => {
            throw new Error("verified cached archive must be reused")
          })(),
        hashFile: async (file) => {
          if (file === fixture.archivePath) return bunRuntime.sha256
          const contents = await readFile(file, "utf8")
          if (contents === "fresh bun" || staleCase !== "tampered bun.exe") {
            return bunRuntime.executableSha256
          }
          return "1".repeat(64)
        },
        readBunVersion: async (file) => {
          const contents = await readFile(file, "utf8")
          if (contents === "cached bun" && staleCase === "wrong bun version") return "0.0.0"
          return bunRuntime.version
        },
        readBunRevision: async (file) => {
          const contents = await readFile(file, "utf8")
          if (contents === "cached bun" && staleCase === "wrong bun revision") {
            return `${bunRuntime.version}+000000000`
          }
          return `${bunRuntime.version}+${bunRuntime.revision}`
        },
        extractArchive: async (_archive, destination) => {
          extractionCount += 1
          const extractedRoot = path.join(destination, bunRuntime.archiveDirectoryName)
          await mkdir(extractedRoot, { recursive: true })
          await writeFile(path.join(extractedRoot, "bun.exe"), "fresh bun")
        },
      },
    })

    expect(result).toBe(path.join(fixture.extractionRoot, "bun.exe"))
    expect(extractionCount).toBe(1)
    expect(await readFile(result, "utf8")).toBe("fresh bun")
  })
}

test("rejects acquire paths outside the explicit controlled root before mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-ownership-test-"))
  onTestFinished(() => rm(root, { recursive: true }))
  const controlledRoot = path.join(root, "controlled")
  const archivePath = path.join(root, "outside", bunRuntime.archiveName)
  const extractionRoot = path.join(
    root,
    "outside",
    `bun-v${bunRuntime.version}-windows-x64-baseline`,
  )
  let mutated = false
  let callbackInvoked = false

  await expect(
    acquireBunRuntime({
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
          return bunRuntime.sha256
        },
        extractArchive: async () => {
          mutated = true
        },
      },
    }),
  ).rejects.toThrow(/controlled root/i)

  expect(mutated).toBe(false)
  expect(callbackInvoked).toBe(false)
})

test("installs the isolated Windows x64 Sharp dependency tree", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-sharp-test-"))
  onTestFinished(async () => (await import("node:fs/promises")).rm(root, { recursive: true }))
  const sourcePackageDirectory = path.join(root, "source")
  const installationRoot = path.join(root, "installed")
  await mkdir(sourcePackageDirectory)
  await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
  await writeFile(path.join(sourcePackageDirectory, "bun.lock"), "{}")
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

  expect(command).toStrictEqual({
    executable: Bun.argv[0],
    args: ["ci", "--production", "--os=win32", "--cpu=x64"],
    cwd: `${installationRoot}.test.staging`,
  })
  expect(result).toBe(path.join(installationRoot, "node_modules"))
})

test("rejects missing Sharp runtime trees and retains the command failure cause", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-sharp-failure-test-"))
  onTestFinished(async () => (await import("node:fs/promises")).rm(root, { recursive: true }))
  const sourcePackageDirectory = path.join(root, "source")
  await mkdir(sourcePackageDirectory)
  await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
  await writeFile(path.join(sourcePackageDirectory, "bun.lock"), "{}")

  for (const missing of ["sharp", "@img"] as const) {
    const installationRoot = path.join(root, `missing-${missing.replace("@", "")}`)
    await expect(
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
    ).rejects.toThrow(new RegExp(`node_modules[\\\\/]${missing}`))
  }

  const cause = new Error("Bun install exploded")
  await expectRejectionSatisfies(
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
  test(`restores the previous runtime installation when ${failedBoundary} rename fails`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-install-rollback-test-"))
    onTestFinished(() => rm(root, { recursive: true }))
    const sourcePackageDirectory = path.join(root, "source")
    const controlledRoot = path.join(root, "controlled")
    const installationRoot = path.join(controlledRoot, "installed")
    const token = failedBoundary.replace(" ", "-")
    const stagingRoot = `${installationRoot}.${token}.staging`
    const backupRoot = `${installationRoot}.${token}.backup`
    await mkdir(sourcePackageDirectory)
    await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
    await writeFile(path.join(sourcePackageDirectory, "bun.lock"), "{}")
    await mkdir(installationRoot, { recursive: true })
    await writeFile(path.join(installationRoot, "previous.txt"), "verified")
    const cause = new Error(`failed ${failedBoundary}`)

    await expectRejectionSatisfies(
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

    expect(await readFile(path.join(installationRoot, "previous.txt"), "utf8")).toBe("verified")
  })
}

test("retains the runtime recovery backup when restoration fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-install-recovery-test-"))
  onTestFinished(() => rm(root, { recursive: true }))
  const sourcePackageDirectory = path.join(root, "source")
  const controlledRoot = path.join(root, "controlled")
  const installationRoot = path.join(controlledRoot, "installed")
  const token = "recovery"
  const stagingRoot = `${installationRoot}.${token}.staging`
  const backupRoot = `${installationRoot}.${token}.backup`
  await mkdir(sourcePackageDirectory)
  await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
  await writeFile(path.join(sourcePackageDirectory, "bun.lock"), "{}")
  await mkdir(installationRoot, { recursive: true })
  await writeFile(path.join(installationRoot, "previous.txt"), "verified")
  const promotionCause = new Error("runtime promotion failed")
  const restorationCause = new Error("runtime restoration failed")

  await expectRejectionSatisfies(
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
      expectTruthy(error instanceof AggregateError)
      expect(error.cause).toBe(promotionCause)
      expect(error.errors).toStrictEqual([promotionCause, restorationCause])
      return true
    },
  )

  expect(await readFile(path.join(backupRoot, "previous.txt"), "utf8")).toBe("verified")
})

test("rejects runtime installation outside the explicit controlled root before mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-runtime-install-ownership-test-"))
  onTestFinished(() => rm(root, { recursive: true }))
  const sourcePackageDirectory = path.join(root, "source")
  await mkdir(sourcePackageDirectory)
  await writeFile(path.join(sourcePackageDirectory, "package.json"), "{}")
  await writeFile(path.join(sourcePackageDirectory, "bun.lock"), "{}")
  let commandRan = false
  let callbackInvoked = false

  await expect(
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
  ).rejects.toThrow(/controlled root/i)

  expect(commandRan).toBe(false)
  expect(callbackInvoked).toBe(false)
})

test("executes the Bun runtime command directly", async () => {
  const bunExecutable = Bun.argv[0]
  if (!bunExecutable) throw new Error("Could not determine the Bun executable")
  await runRuntimeCommand({
    executable: bunExecutable,
    args: ["--version"],
    cwd: process.cwd(),
  })
})
