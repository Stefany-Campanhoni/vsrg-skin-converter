import { expect, onTestFinished, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { assembleWindowsPortable } from "../../.ci/release/assemble-windows-portable.ts"
import { expectRejectionSatisfies, expectTruthy } from "../support/expectations.ts"

async function writeFixture(file: string, contents: string): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, contents)
  return file
}

async function packageFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-assembly-test-"))
  const source = path.join(root, "source")
  const packageRoot = path.join(root, "output", "vsrg-skin-converter-v1.0.0-win-x64")
  const bundlePath = await writeFixture(path.join(source, "app.mjs"), "bundle")
  const nodeExecutablePath = await writeFixture(path.join(source, "node.exe"), "node")
  const runtimeNodeModulesPath = path.join(source, "node_modules")
  await writeFixture(path.join(runtimeNodeModulesPath, "sharp", "index.js"), "sharp")
  await writeFixture(path.join(runtimeNodeModulesPath, "sharp", "LICENSE"), "sharp license")
  await writeFixture(path.join(runtimeNodeModulesPath, "sharp", "lib", "index.d.ts"), "types")
  await writeFixture(path.join(runtimeNodeModulesPath, "sharp", "test", "runtime.test.js"), "test")
  await writeFixture(path.join(runtimeNodeModulesPath, "sharp", "index.js.map"), "map")
  await writeFixture(path.join(runtimeNodeModulesPath, "sharp", ".cache", "state"), "cache")
  await writeFixture(path.join(runtimeNodeModulesPath, "detect-libc", "index.js"), "detect-libc")
  await writeFixture(path.join(runtimeNodeModulesPath, "semver", "index.js"), "semver")
  await writeFixture(path.join(runtimeNodeModulesPath, ".bin", "semver.cmd"), "bin")
  await writeFixture(path.join(runtimeNodeModulesPath, "@img", "colour", "index.js"), "colour")
  await writeFixture(
    path.join(runtimeNodeModulesPath, "@img", "sharp-win32-x64", "sharp.node"),
    "native",
  )
  await writeFixture(
    path.join(runtimeNodeModulesPath, "@img", "sharp-wasm32", "sharp.wasm"),
    "wasm",
  )
  const templatesRoot = path.join(source, "templates")
  await writeFixture(path.join(templatesRoot, "osu", "template.txt"), "osu-template")
  await writeFixture(path.join(templatesRoot, "etterna", "template.txt"), "etterna-template")
  const staticRoot = path.join(source, "static")
  const launcherPath = await writeFixture(path.join(staticRoot, "launcher.cmd"), "launcher")
  const readmePath = await writeFixture(path.join(staticRoot, "README.txt"), "readme")
  const noticesPath = await writeFixture(
    path.join(staticRoot, "THIRD-PARTY-NOTICES.txt"),
    "notices",
  )
  const licensePath = await writeFixture(path.join(source, "LICENSE"), "license")
  return {
    root,
    source,
    controlledRoot: path.dirname(packageRoot),
    packageRoot,
    bundlePath,
    nodeExecutablePath,
    runtimeNodeModulesPath,
    templatesRoot,
    launcherPath,
    readmePath,
    noticesPath,
    licensePath,
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    )
    .sort()
}

test("assembles exactly the supported portable package with byte-identical templates", async () => {
  const fixture = await packageFixture()
  onTestFinished(() => rm(fixture.root, { recursive: true }))

  const portable = await assembleWindowsPortable({
    ...fixture,
    dependencies: { token: () => "success" },
  })

  expect(portable).toStrictEqual({
    root: fixture.packageRoot,
    launcher: path.join(fixture.packageRoot, "vsrg-skin-converter.cmd"),
    bundle: path.join(fixture.packageRoot, "app.mjs"),
    nodeExecutable: path.join(fixture.packageRoot, "runtime", "node.exe"),
  })
  expect(await listFiles(fixture.packageRoot)).toStrictEqual([
    "LICENSE",
    "README.txt",
    "THIRD-PARTY-NOTICES.txt",
    "app.mjs",
    "node_modules/@img/colour/index.js",
    "node_modules/@img/sharp-win32-x64/sharp.node",
    "node_modules/detect-libc/index.js",
    "node_modules/semver/index.js",
    "node_modules/sharp/LICENSE",
    "node_modules/sharp/index.js",
    "runtime/node.exe",
    "templates/etterna/template.txt",
    "templates/osu/template.txt",
    "vsrg-skin-converter.cmd",
  ])
  expect(
    await readFile(path.join(fixture.packageRoot, "templates", "osu", "template.txt"), "utf8"),
  ).toBe("osu-template")
  expect(
    await readFile(path.join(fixture.packageRoot, "templates", "etterna", "template.txt"), "utf8"),
  ).toBe("etterna-template")
  expect(
    (await readdir(path.dirname(fixture.packageRoot))).filter((name) => name.includes(".staging")),
  ).toStrictEqual([])
})

test("preserves a previous package and removes staging when assembly fails", async () => {
  const fixture = await packageFixture()
  onTestFinished(() => rm(fixture.root, { recursive: true }))
  await mkdir(fixture.packageRoot, { recursive: true })
  await writeFile(path.join(fixture.packageRoot, "previous.txt"), "verified")

  await expect(
    assembleWindowsPortable({
      ...fixture,
      readmePath: path.join(fixture.source, "missing-readme.txt"),
      dependencies: { token: () => "failure" },
    }),
  ).rejects.toThrow(/missing-readme\.txt/i)

  expect(await readFile(path.join(fixture.packageRoot, "previous.txt"), "utf8")).toBe("verified")
  expect(
    (await readdir(path.dirname(fixture.packageRoot))).filter((name) => name.includes(".staging")),
  ).toStrictEqual([])
})

test("retries a transient Windows sharing violation while promoting staging", async () => {
  const fixture = await packageFixture()
  onTestFinished(() => rm(fixture.root, { recursive: true }))
  let promotionAttempts = 0
  const events: string[] = []

  await assembleWindowsPortable({
    ...fixture,
    dependencies: {
      token: () => "retry",
      delay: async (milliseconds) => {
        events.push(`delay:${milliseconds}`)
      },
      renamePath: async (source, destination) => {
        if (source.endsWith(".staging") && destination === fixture.packageRoot) {
          promotionAttempts += 1
          events.push("rename")
          if (promotionAttempts === 1) {
            const error = new Error("file is temporarily locked") as NodeJS.ErrnoException
            error.code = "EPERM"
            throw error
          }
        }
        await rename(source, destination)
      },
    },
  })

  expect(promotionAttempts).toBe(2)
  expect(events).toStrictEqual(["rename", "delay:50", "rename"])
})

test("retains the previous package backup when rollback restoration fails", async () => {
  const fixture = await packageFixture()
  onTestFinished(() => rm(fixture.root, { recursive: true }))
  await mkdir(fixture.packageRoot, { recursive: true })
  await writeFile(path.join(fixture.packageRoot, "previous.txt"), "verified")
  const token = "recovery"
  const backupRoot = `${fixture.packageRoot}.${token}.backup`
  const promotionCause = new Error("promotion failed")
  const restorationCause = new Error("restoration failed")

  await expectRejectionSatisfies(
    assembleWindowsPortable({
      ...fixture,
      dependencies: {
        token: () => token,
        delay: async () => {},
        renamePath: async (source, destination) => {
          if (source.endsWith(".staging") && destination === fixture.packageRoot) {
            throw promotionCause
          }
          if (source === backupRoot && destination === fixture.packageRoot) {
            throw restorationCause
          }
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

test("rejects package output outside the explicit controlled root before mutation", async () => {
  const fixture = await packageFixture()
  onTestFinished(() => rm(fixture.root, { recursive: true }))
  const outsidePackageRoot = path.join(fixture.root, "outside", path.basename(fixture.packageRoot))
  let renamed = false
  let callbackInvoked = false

  await expect(
    assembleWindowsPortable({
      ...fixture,
      packageRoot: outsidePackageRoot,
      dependencies: {
        token: () => {
          callbackInvoked = true
          return "outside"
        },
        delay: async () => {},
        renamePath: async (source, destination) => {
          renamed = true
          await rename(source, destination)
        },
      },
    }),
  ).rejects.toThrow(/controlled root/i)

  expect(renamed).toBe(false)
  expect(callbackInvoked).toBe(false)
  await expect(readFile(path.join(outsidePackageRoot, "app.mjs"))).rejects.toThrow(/ENOENT/)
})
