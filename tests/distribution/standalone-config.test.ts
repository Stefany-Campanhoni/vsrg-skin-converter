import { expect, test } from "bun:test"
import path from "node:path"
import {
  assertStandaloneBunRuntime,
  getStandalonePaths,
  standaloneBunRevision,
  standaloneBunVersion,
  standaloneNativeAssets,
  standaloneTarget,
} from "../../.ci/standalone/standalone-config.ts"
import packageJson from "../../package.json" with { type: "json" }

test("keeps the standalone candidate versioned, experimental, and outside release output", () => {
  const projectRoot = path.resolve("C:/project")
  const paths = getStandalonePaths(projectRoot, packageJson.version)

  expect(paths.outputFile).toBe(
    path.join(
      projectRoot,
      "build",
      "standalone",
      `vsrg-skin-converter-v${packageJson.version}-win-x64-experimental.exe`,
    ),
  )
  expect(path.relative(projectRoot, paths.outputFile)).toStartWith(`build${path.sep}standalone`)
  expect(paths.outputFile).not.toContain(`${path.sep}release${path.sep}`)
  expect(standaloneTarget).toBe("bun-windows-x64-baseline")
})

test("rejects a filesystem root before deriving a recursively cleaned build directory", () => {
  const filesystemRoot = path.parse(path.resolve(".")).root

  expect(() => getStandalonePaths(filesystemRoot, packageJson.version)).toThrow(/filesystem root/i)
})

test("pins the exact Bun runtime that is embedded in the standalone candidate", () => {
  expect(() =>
    assertStandaloneBunRuntime(standaloneBunVersion, standaloneBunRevision),
  ).not.toThrow()
  expect(() => assertStandaloneBunRuntime("1.4.1", standaloneBunRevision)).toThrow(
    /expected Bun 1\.4\.0/i,
  )
  expect(() => assertStandaloneBunRuntime(standaloneBunVersion, "wrong-revision")).toThrow(
    /revision 34cbb9a40b4bd1bd767d134a7065e66c2432a676/i,
  )
})

test("embeds only the Windows x64 Sharp addon and its required DLL closure", () => {
  expect(standaloneNativeAssets).toEqual([
    {
      sourceName: "sharp-win32-x64-0.35.3.node",
      embeddedName: "sharp-win32-x64-0.35.3.bin",
      runtimeName: "sharp-win32-x64-0.35.3.node",
      sha256: "45dbb968dff27a1e8d8870d2a34e6f5418fa2a1a4fe27a7ed13ab2fb3f895468",
    },
    {
      sourceName: "libvips-42.dll",
      embeddedName: "libvips-42.bin",
      runtimeName: "libvips-42.dll",
      sha256: "6d8ec83a826a1b46ef25a670501fd186475568dd3e48893cb4f756d0f2f428d8",
    },
    {
      sourceName: "libvips-cpp-8.18.3.dll",
      embeddedName: "libvips-cpp-8.18.3.bin",
      runtimeName: "libvips-cpp-8.18.3.dll",
      sha256: "d6eb3395e6f7799c9e2c997aba38068f1ab0684dc08a853013dbe528649306b9",
    },
  ])
})

test("exposes one manual build command without adding standalone release scripts", () => {
  expect(packageJson.scripts["build:standalone"]).toBe("bun .ci/standalone/build-standalone.ts")
  expect(Object.keys(packageJson.scripts).filter((name) => name.includes("standalone"))).toEqual([
    "build:standalone",
  ])
})
