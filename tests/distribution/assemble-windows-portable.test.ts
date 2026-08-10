import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { assembleWindowsPortable } from "../../scripts/release/assemble-windows-portable.ts"

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
  await writeFixture(
    path.join(runtimeNodeModulesPath, "@img", "sharp-win32-x64", "sharp.node"),
    "native",
  )
  await writeFixture(
    path.join(runtimeNodeModulesPath, "@img", "sharp-libvips-win32-x64", "libvips.dll"),
    "libvips",
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

test("assembles exactly the supported portable package with byte-identical templates", async (context) => {
  const fixture = await packageFixture()
  context.after(() => rm(fixture.root, { recursive: true }))

  const portable = await assembleWindowsPortable({
    ...fixture,
    dependencies: { token: () => "success" },
  })

  assert.deepEqual(portable, {
    root: fixture.packageRoot,
    launcher: path.join(fixture.packageRoot, "vsrg-skin-converter.cmd"),
    bundle: path.join(fixture.packageRoot, "app.mjs"),
    nodeExecutable: path.join(fixture.packageRoot, "runtime", "node.exe"),
  })
  assert.deepEqual(await listFiles(fixture.packageRoot), [
    "LICENSE",
    "README.txt",
    "THIRD-PARTY-NOTICES.txt",
    "app.mjs",
    "node_modules/@img/sharp-libvips-win32-x64/libvips.dll",
    "node_modules/@img/sharp-win32-x64/sharp.node",
    "node_modules/sharp/LICENSE",
    "node_modules/sharp/index.js",
    "runtime/node.exe",
    "templates/etterna/template.txt",
    "templates/osu/template.txt",
    "vsrg-skin-converter.cmd",
  ])
  assert.equal(
    await readFile(path.join(fixture.packageRoot, "templates", "osu", "template.txt"), "utf8"),
    "osu-template",
  )
  assert.equal(
    await readFile(path.join(fixture.packageRoot, "templates", "etterna", "template.txt"), "utf8"),
    "etterna-template",
  )
  assert.deepEqual(
    (await readdir(path.dirname(fixture.packageRoot))).filter((name) => name.includes(".staging")),
    [],
  )
})

test("preserves a previous package and removes staging when assembly fails", async (context) => {
  const fixture = await packageFixture()
  context.after(() => rm(fixture.root, { recursive: true }))
  await mkdir(fixture.packageRoot, { recursive: true })
  await writeFile(path.join(fixture.packageRoot, "previous.txt"), "verified")

  await assert.rejects(
    assembleWindowsPortable({
      ...fixture,
      readmePath: path.join(fixture.source, "missing-readme.txt"),
      dependencies: { token: () => "failure" },
    }),
    /missing-readme\.txt/i,
  )

  assert.equal(await readFile(path.join(fixture.packageRoot, "previous.txt"), "utf8"), "verified")
  assert.deepEqual(
    (await readdir(path.dirname(fixture.packageRoot))).filter((name) => name.includes(".staging")),
    [],
  )
})
