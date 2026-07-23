import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createSkinFileResolver } from "./resolve-skin-files.ts"

async function withSkin(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-resolver-"))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("resolves assets case-insensitively without an extension", async () => {
  await withSkin(async (directory) => {
    await mkdir(path.join(directory, "Receptors"))
    const expected = path.join(directory, "Receptors", "_Down Go Receptor.png")
    await writeFile(expected, "")

    const resolver = await createSkinFileResolver(directory)

    assert.deepEqual(resolver.resolveAssets("_down", "go receptor"), [
      { filePath: expected, columns: 1, rows: 1 },
    ])
  })
})

test("extracts sprite layout metadata from decorated filenames", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "_Down Go Receptor Go 2x1 (doubleres).png")
    await writeFile(expected, "")

    const resolver = await createSkinFileResolver(directory)

    assert.deepEqual(resolver.resolveAssets("_down", "Go Receptor Go"), [
      { filePath: expected, columns: 2, rows: 1 },
    ])
  })
})

test("matches StepMania wildcard suffixes after the requested logical name", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "_Down Go Receptor Go 2x1 (doubleres).png")
    await writeFile(expected, "")

    const resolver = await createSkinFileResolver(directory)

    assert.deepEqual(resolver.resolveAssets("_down", "Go Receptor"), [
      { filePath: expected, columns: 2, rows: 1 },
    ])
  })
})

test("does not interpret res metadata as a spritesheet layout", async () => {
  await withSkin(async (directory) => {
    await mkdir(path.join(directory, "Receptors"))
    const expected = path.join(directory, "Receptors", "release left (res 64x64).png")
    await writeFile(expected, "")

    const resolver = await createSkinFileResolver(directory)

    assert.deepEqual(resolver.resolveAssets("", "Receptors/release left"), [
      { filePath: expected, columns: 1, rows: 1 },
    ])
  })
})

test("accepts a logical texture name that already includes its extension", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "Receptor 4x1 (doubleres).png")
    await writeFile(expected, "")

    const resolver = await createSkinFileResolver(directory)

    assert.deepEqual(resolver.resolveAssets("Receptor 4x1 (doubleres).png"), [
      { filePath: expected, columns: 4, rows: 1 },
    ])
  })
})

test("follows receptor redirections", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "Down Receptor.lua")
    await writeFile(expected, "return Def.Actor {}")
    await writeFile(path.join(directory, "Up Receptor.redir"), "Down Receptor")

    const resolver = await createSkinFileResolver(directory)

    assert.equal(await resolver.resolveReceptorLua("up"), expected)
  })
})

test("resolves external Lua files for arbitrary elements", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "Down Tap Note.lua")
    await writeFile(expected, "return Def.Sprite {}")
    await writeFile(path.join(directory, "Up Tap Note.redir"), "Down Tap Note")

    const resolver = await createSkinFileResolver(directory)

    assert.equal(await resolver.resolveElementLua("down", "Tap Note"), expected)
    assert.equal(await resolver.resolveElementLua("up", "Tap Note"), expected)
  })
})

test("applies cycle and skin-boundary checks to arbitrary elements", async () => {
  await withSkin(async (directory) => {
    await writeFile(path.join(directory, "Up Tap Note.redir"), "Down Tap Note")
    await writeFile(path.join(directory, "Down Tap Note.redir"), "Up Tap Note")

    const resolver = await createSkinFileResolver(directory)

    await assert.rejects(() => resolver.resolveElementLua("up", "Tap Note"), /cycle/i)
  })

  await withSkin(async (directory) => {
    await writeFile(path.join(directory, "Down Tap Note.redir"), "../outside")

    const resolver = await createSkinFileResolver(directory)

    await assert.rejects(() => resolver.resolveElementLua("down", "Tap Note"), /outside the skin/i)
  })
})

test("rejects redirection cycles", async () => {
  await withSkin(async (directory) => {
    await writeFile(path.join(directory, "Up Receptor.redir"), "Down Receptor")
    await writeFile(path.join(directory, "Down Receptor.redir"), "Up Receptor")

    const resolver = await createSkinFileResolver(directory)

    await assert.rejects(() => resolver.resolveReceptorLua("up"), /cycle/i)
  })
})

test("does not resolve paths outside the skin", async () => {
  await withSkin(async (directory) => {
    await writeFile(path.join(directory, "Down Receptor.redir"), "../outside")

    const resolver = await createSkinFileResolver(directory)

    await assert.rejects(() => resolver.resolveReceptorLua("down"), /outside the skin/i)
    assert.deepEqual(resolver.resolveAssets("../outside"), [])
  })
})
