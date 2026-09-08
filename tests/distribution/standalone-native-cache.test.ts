import { afterEach, expect, test } from "bun:test"
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  materializeNativeClosure,
  type NativeCacheAsset,
} from "../../.ci/standalone/native-cache.ts"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((temporaryRoot) => rm(temporaryRoot, { recursive: true, force: true })),
  )
})

test("publishes the complete native closure atomically and reuses the immutable cache", async () => {
  const fixture = await createFixture()
  const firstRoot = await materializeNativeClosure(fixture.options)
  const firstStats = await lstat(path.join(firstRoot, "addon.node"))
  const secondRoot = await materializeNativeClosure(fixture.options)
  const secondStats = await lstat(path.join(secondRoot, "addon.node"))

  expect(secondRoot).toBe(firstRoot)
  expect(await Bun.file(path.join(firstRoot, "addon.node")).text()).toBe("native-addon")
  expect(await Bun.file(path.join(firstRoot, "dependency.dll")).text()).toBe("native-dll")
  expect(secondStats.mtimeMs).toBe(firstStats.mtimeMs)
})

test("allows concurrent publishers without exposing a partial closure", async () => {
  const fixture = await createFixture()
  const roots = await Promise.all([
    materializeNativeClosure(fixture.options),
    materializeNativeClosure(fixture.options),
  ])

  expect(new Set(roots).size).toBe(1)
  expect(await Bun.file(path.join(roots[0] ?? "", "addon.node")).text()).toBe("native-addon")
  expect(await Bun.file(path.join(roots[0] ?? "", "dependency.dll")).text()).toBe("native-dll")
})

test("fails closed instead of replacing an invalid existing cache", async () => {
  const fixture = await createFixture()
  const cacheRoot = path.join(fixture.options.cacheParent, fixture.options.cacheName)
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(path.join(cacheRoot, "addon.node"), "untrusted")

  await expect(materializeNativeClosure(fixture.options)).rejects.toThrow(/native cache/i)
  expect(await Bun.file(path.join(cacheRoot, "addon.node")).text()).toBe("untrusted")
  expect(await Bun.file(path.join(cacheRoot, "dependency.dll")).exists()).toBe(false)
})

async function createFixture(): Promise<{
  readonly options: {
    readonly cacheParent: string
    readonly cacheName: string
    readonly assets: readonly NativeCacheAsset[]
  }
}> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vsrg-standalone-cache-test-"))
  temporaryRoots.push(temporaryRoot)
  const sourceRoot = path.join(temporaryRoot, "embedded")
  const cacheParent = path.join(temporaryRoot, "cache")
  await mkdir(sourceRoot, { recursive: true })
  const sources = [
    { runtimeName: "addon.node", contents: "native-addon" },
    { runtimeName: "dependency.dll", contents: "native-dll" },
  ] as const
  const assets: NativeCacheAsset[] = []
  for (const source of sources) {
    const sourcePath = path.join(sourceRoot, source.runtimeName)
    await writeFile(sourcePath, source.contents)
    assets.push({
      sourcePath,
      runtimeName: source.runtimeName,
      sha256: new Bun.CryptoHasher("sha256").update(source.contents).digest("hex"),
    })
  }
  return { options: { cacheParent, cacheName: "sharp-pinned", assets } }
}
