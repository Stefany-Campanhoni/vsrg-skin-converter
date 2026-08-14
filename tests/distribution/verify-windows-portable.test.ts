import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createWindowsRelease } from "../../.ci/release/create-windows-release.ts"
import { verifyWindowsPortable } from "../../.ci/release/verify-windows-portable.ts"

async function writeFixture(file: string, value = file): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, value)
}

async function verificationFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-verification-test-"))
  const packageRoot = path.join(root, "vsrg-skin-converter-v1.0.0-win-x64")
  const sourceTemplatesRoot = path.join(root, "source-templates")
  for (const [relative, value] of [
    ["osu/template.ini", "osu"],
    ["etterna/metrics.ini", "etterna"],
  ] as const) {
    await writeFixture(path.join(sourceTemplatesRoot, relative), value)
    await writeFixture(path.join(packageRoot, "templates", relative), value)
  }
  for (const relative of [
    "vsrg-skin-converter.cmd",
    "app.mjs",
    "runtime/node.exe",
    "node_modules/sharp/index.js",
    "node_modules/detect-libc/index.js",
    "node_modules/semver/index.js",
    "node_modules/@img/colour/index.js",
    "node_modules/@img/sharp-win32-x64/sharp.node",
    "README.txt",
    "LICENSE",
    "THIRD-PARTY-NOTICES.txt",
  ]) {
    await writeFixture(path.join(packageRoot, relative), relative)
  }
  return { root, packageRoot, sourceTemplatesRoot }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function assertInvalidEntry(
  packageRoot: string,
  sourceTemplatesRoot: string,
  entry: string,
): Promise<void> {
  await assert.rejects(
    verifyWindowsPortable({ packageRoot, sourceTemplatesRoot, runRuntimeChecks: false }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, new RegExp(escapeRegex(entry), "i"))
      assert.match(error.message, new RegExp(escapeRegex(packageRoot), "i"))
      return true
    },
  )
}

test("accepts the exact supported package manifest and matching templates", async (context) => {
  const fixture = await verificationFixture()
  context.after(() => rm(fixture.root, { recursive: true }))
  await verifyWindowsPortable({ ...fixture, runRuntimeChecks: false })
})

test("names a missing required entry and the package root", async (context) => {
  const fixture = await verificationFixture()
  context.after(() => rm(fixture.root, { recursive: true }))
  await rm(path.join(fixture.packageRoot, "app.mjs"))
  await assertInvalidEntry(fixture.packageRoot, fixture.sourceTemplatesRoot, "app.mjs")
})

test("rejects forbidden development artifacts and unexpected node executables", async (context) => {
  const fixture = await verificationFixture()
  context.after(() => rm(fixture.root, { recursive: true }))
  for (const entry of [
    "unexpected.ts",
    "node_modules/sharp/internal.test.js",
    "app.mjs.map",
    "node_modules/sharp/.cache/data",
    "node_modules/sharp/nested/node.exe",
    "node_modules/@img/sharp-wasm32/sharp.wasm",
  ]) {
    await writeFixture(path.join(fixture.packageRoot, entry), "forbidden")
    const rejectedEntry = entry.includes("sharp-wasm32") ? "node_modules/@img/sharp-wasm32" : entry
    await assertInvalidEntry(fixture.packageRoot, fixture.sourceTemplatesRoot, rejectedEntry)
    await rm(path.join(fixture.packageRoot, entry))
    if (entry.includes("/.cache/")) {
      await rm(path.dirname(path.join(fixture.packageRoot, entry)), { recursive: true })
    }
  }
})

test("rejects unexpected package entries", async (context) => {
  const fixture = await verificationFixture()
  context.after(() => rm(fixture.root, { recursive: true }))
  await writeFixture(path.join(fixture.packageRoot, "debug.log"), "unexpected")
  await assertInvalidEntry(fixture.packageRoot, fixture.sourceTemplatesRoot, "debug.log")
})

test("rejects a packaged template whose bytes differ from the source", async (context) => {
  const fixture = await verificationFixture()
  context.after(() => rm(fixture.root, { recursive: true }))
  const entry = "templates/osu/template.ini"
  await writeFile(path.join(fixture.packageRoot, entry), "changed")
  await assertInvalidEntry(fixture.packageRoot, fixture.sourceTemplatesRoot, entry)
})

test("rejects symlinks in the portable package", async (context) => {
  const fixture = await verificationFixture()
  context.after(() => rm(fixture.root, { recursive: true }))
  const entry = "node_modules/sharp/link"
  try {
    await symlink(
      path.join(fixture.packageRoot, "node_modules", "@img"),
      path.join(fixture.packageRoot, entry),
      "junction",
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM")
      return context.skip("symlinks unavailable")
    throw error
  }
  await assertInvalidEntry(fixture.packageRoot, fixture.sourceTemplatesRoot, entry)
})

test("publishes a versioned ZIP and checksum only after independent extraction verification", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-release-test-"))
  context.after(() => rm(root, { recursive: true }))
  const packageDirectoryName = "vsrg-skin-converter-v1.0.0-win-x64"
  const packageRoot = path.join(root, "build", packageDirectoryName)
  const releaseRoot = path.join(root, "release")
  const zipPath = path.join(releaseRoot, `${packageDirectoryName}.zip`)
  const checksumPath = `${zipPath}.sha256`
  await writeFixture(path.join(packageRoot, "marker"), "package")
  const calls: string[] = []
  const sha256 = "a".repeat(64)

  const artifact = await createWindowsRelease({
    packageRoot,
    packageDirectoryName,
    zipPath,
    checksumPath,
    sourceTemplatesRoot: path.join(root, "templates"),
    expectedVersion: "1.0.0",
    dependencies: {
      token: () => "success",
      compress: async (source, destination) => {
        calls.push(`compress:${source}:${destination}`)
        await writeFile(destination, "zip")
      },
      extract: async (archive, destination) => {
        calls.push(`extract:${archive}:${destination}`)
        await writeFixture(path.join(destination, packageDirectoryName, "marker"), "package")
      },
      hashFile: async (file) => {
        calls.push(`hash:${file}`)
        return sha256
      },
      verifyPackage: async (packageToVerify) => {
        calls.push(`verify:${packageToVerify}`)
      },
    },
  })

  assert.deepEqual(artifact, { zipPath, checksumPath, sha256 })
  assert.equal(await readFile(zipPath, "utf8"), "zip")
  assert.equal(await readFile(checksumPath, "utf8"), `${sha256}  ${path.basename(zipPath)}\n`)
  assert.equal(calls[0], `verify:${packageRoot}`)
  assert.match(calls[1] ?? "", new RegExp(`^compress:${escapeRegex(packageRoot)}:`))
  assert.equal(calls.filter((call) => call.startsWith("hash:")).length, 2)
  assert.match(calls.at(-1) ?? "", new RegExp(`^verify:.*${escapeRegex(packageDirectoryName)}$`))
})

test("preserves the previous ZIP and checksum when extracted verification fails", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-release-failure-test-"))
  context.after(() => rm(root, { recursive: true }))
  const packageDirectoryName = "vsrg-skin-converter-v1.0.0-win-x64"
  const packageRoot = path.join(root, "build", packageDirectoryName)
  const releaseRoot = path.join(root, "release")
  const zipPath = path.join(releaseRoot, `${packageDirectoryName}.zip`)
  const checksumPath = `${zipPath}.sha256`
  await writeFixture(path.join(packageRoot, "marker"), "package")
  await writeFixture(zipPath, "previous zip")
  await writeFixture(checksumPath, "previous checksum")
  let verificationCount = 0
  const cause = new Error("extracted package invalid")

  await assert.rejects(
    createWindowsRelease({
      packageRoot,
      packageDirectoryName,
      zipPath,
      checksumPath,
      sourceTemplatesRoot: path.join(root, "templates"),
      expectedVersion: "1.0.0",
      dependencies: {
        token: () => "failure",
        compress: async (_source, destination) => writeFile(destination, "new zip"),
        extract: async (_archive, destination) => {
          await writeFixture(path.join(destination, packageDirectoryName, "marker"), "package")
        },
        hashFile: async () => "b".repeat(64),
        verifyPackage: async () => {
          verificationCount += 1
          if (verificationCount === 2) throw cause
        },
      },
    }),
    (error: unknown) => error === cause,
  )

  assert.equal(await readFile(zipPath, "utf8"), "previous zip")
  assert.equal(await readFile(checksumPath, "utf8"), "previous checksum")
})

for (const failedBoundary of [
  "backup ZIP",
  "backup checksum",
  "publish ZIP",
  "publish checksum",
] as const) {
  test(`rolls back the previous release pair when ${failedBoundary} rename fails`, async (context) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-release-rollback-test-"))
    context.after(() => rm(root, { recursive: true }))
    const packageDirectoryName = "vsrg-skin-converter-v1.0.0-win-x64"
    const packageRoot = path.join(root, "build", packageDirectoryName)
    const releaseRoot = path.join(root, "release")
    const zipPath = path.join(releaseRoot, `${packageDirectoryName}.zip`)
    const checksumPath = `${zipPath}.sha256`
    const token = failedBoundary.replace(" ", "-")
    const zipBackup = `${zipPath}.${token}.backup`
    const checksumBackup = `${checksumPath}.${token}.backup`
    await writeFixture(path.join(packageRoot, "marker"), "package")
    await writeFixture(zipPath, "previous zip")
    await writeFixture(checksumPath, "previous checksum")
    const cause = new Error(`failed ${failedBoundary}`)

    await assert.rejects(
      createWindowsRelease({
        packageRoot,
        packageDirectoryName,
        zipPath,
        checksumPath,
        sourceTemplatesRoot: path.join(root, "templates"),
        expectedVersion: "1.0.0",
        dependencies: {
          token: () => token,
          compress: async (_source, destination) => writeFile(destination, "new zip"),
          extract: async (_archive, destination) => {
            await writeFixture(path.join(destination, packageDirectoryName, "marker"), "package")
          },
          hashFile: async () => "c".repeat(64),
          verifyPackage: async () => {},
          delay: async () => {},
          renamePath: async (source, destination) => {
            const boundary =
              source === zipPath && destination === zipBackup
                ? "backup ZIP"
                : source === checksumPath && destination === checksumBackup
                  ? "backup checksum"
                  : source.endsWith(".tmp.zip") && destination === zipPath
                    ? "publish ZIP"
                    : source.endsWith(".tmp.zip.sha256") && destination === checksumPath
                      ? "publish checksum"
                      : undefined
            if (boundary === failedBoundary) throw cause
            await rename(source, destination)
          },
        },
      }),
      (error: unknown) => error === cause,
    )

    assert.equal(await readFile(zipPath, "utf8"), "previous zip")
    assert.equal(await readFile(checksumPath, "utf8"), "previous checksum")
  })
}

test("retains both recovery backups when rollback cannot restore the previous pair", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-release-recovery-test-"))
  context.after(() => rm(root, { recursive: true }))
  const packageDirectoryName = "vsrg-skin-converter-v1.0.0-win-x64"
  const packageRoot = path.join(root, "build", packageDirectoryName)
  const releaseRoot = path.join(root, "release")
  const zipPath = path.join(releaseRoot, `${packageDirectoryName}.zip`)
  const checksumPath = `${zipPath}.sha256`
  const token = "recovery"
  const zipBackup = `${zipPath}.${token}.backup`
  const checksumBackup = `${checksumPath}.${token}.backup`
  await writeFixture(path.join(packageRoot, "marker"), "package")
  await writeFixture(zipPath, "previous zip")
  await writeFixture(checksumPath, "previous checksum")
  const publicationCause = new Error("failed checksum publication")
  const restorationCause = new Error("failed ZIP restoration")

  await assert.rejects(
    createWindowsRelease({
      packageRoot,
      packageDirectoryName,
      zipPath,
      checksumPath,
      sourceTemplatesRoot: path.join(root, "templates"),
      expectedVersion: "1.0.0",
      dependencies: {
        token: () => token,
        compress: async (_source, destination) => writeFile(destination, "new zip"),
        extract: async (_archive, destination) => {
          await writeFixture(path.join(destination, packageDirectoryName, "marker"), "package")
        },
        hashFile: async () => "d".repeat(64),
        verifyPackage: async () => {},
        delay: async () => {},
        renamePath: async (source, destination) => {
          if (source.endsWith(".tmp.zip.sha256") && destination === checksumPath) {
            throw publicationCause
          }
          if (source === zipBackup && destination === zipPath) throw restorationCause
          await rename(source, destination)
        },
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError)
      assert.equal(error.cause, publicationCause)
      assert.deepEqual(error.errors, [publicationCause, restorationCause])
      return true
    },
  )

  assert.equal(await readFile(zipBackup, "utf8"), "previous zip")
  assert.equal(await readFile(checksumBackup, "utf8"), "previous checksum")
})
