import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { resolveOsuJudgementAsset } from "./resolve-osu-judgement-asset.ts"

async function withSkin(run: (skinDirectory: string) => Promise<void>): Promise<void> {
  const skinDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-judgement-")))
  try {
    await run(skinDirectory)
  } finally {
    await rm(skinDirectory, { recursive: true, force: true })
  }
}

async function writePng(skinDirectory: string, relativePath: string): Promise<string> {
  const filePath = path.join(skinDirectory, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, "png")
  return filePath
}

function resolve(
  skinDirectory: string,
  logicalPath: string | undefined,
  defaultFileName = "mania-hit0",
  useDoubleResolutionAssets = false,
) {
  return resolveOsuJudgementAsset({
    skinDirectory,
    logicalPath,
    defaultFileName,
    useDoubleResolutionAssets,
  })
}

test("resolves a simple skin.ini judgement name from the skin root", async () => {
  await withSkin(async (skinDirectory) => {
    const expected = await writePng(skinDirectory, "0.png")

    const asset = await resolve(skinDirectory, "0")

    assert.equal(asset.filePath, expected)
    assert.equal(asset.pixelDensity, "standard")
  })
})

test("prefers animation frame zero over the unsuffixed referenced judgement", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "0.png")
    const expected = await writePng(skinDirectory, "0-0.png")

    const asset = await resolve(skinDirectory, "0")

    assert.equal(asset.filePath, expected)
  })
})

test("resolves the osu default judgement name inside a referenced directory", async () => {
  await withSkin(async (skinDirectory) => {
    const expected = await writePng(skinDirectory, "judgements/mania-hit50.png")

    const asset = await resolve(skinDirectory, "judgements", "mania-hit50")

    assert.equal(asset.filePath, expected)
  })
})

test("uses the frame-zero osu default from the skin root when the property is absent", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "mania-hit300.png")
    const expected = await writePng(skinDirectory, "mania-hit300-0.png")

    const asset = await resolve(skinDirectory, undefined, "mania-hit300")

    assert.equal(asset.filePath, expected)
  })
})

test("applies selected density after the frame-zero suffix", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "mania-hit300g@2x.png")
    const expected = await writePng(skinDirectory, "mania-hit300g-0@2x.png")

    const asset = await resolve(skinDirectory, undefined, "mania-hit300g", true)

    assert.equal(asset.filePath, expected)
    assert.equal(asset.pixelDensity, "double")
  })
})

test("rejects traversal before deriving frame-zero candidates", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "..-0.png")

    await assert.rejects(() => resolve(skinDirectory, ".."), /traversal/i)
  })
})
