import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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

    expect(resolver.resolveAssets("_down", "go receptor")).toStrictEqual([
      { filePath: expected, columns: 1, rows: 1 },
    ])
  })
})

test("extracts sprite layout metadata from decorated filenames", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "_Down Go Receptor Go 2x1 (doubleres).png")
    await writeFile(expected, "")

    const resolver = await createSkinFileResolver(directory)

    expect(resolver.resolveAssets("_down", "Go Receptor Go")).toStrictEqual([
      { filePath: expected, columns: 2, rows: 1 },
    ])
  })
})

test("matches StepMania wildcard suffixes after the requested logical name", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "_Down Go Receptor Go 2x1 (doubleres).png")
    await writeFile(expected, "")

    const resolver = await createSkinFileResolver(directory)

    expect(resolver.resolveAssets("_down", "Go Receptor")).toStrictEqual([
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

    expect(resolver.resolveAssets("", "Receptors/release left")).toStrictEqual([
      { filePath: expected, columns: 1, rows: 1 },
    ])
  })
})

test("accepts a logical texture name that already includes its extension", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "Receptor 4x1 (doubleres).png")
    await writeFile(expected, "")

    const resolver = await createSkinFileResolver(directory)

    expect(resolver.resolveAssets("Receptor 4x1 (doubleres).png")).toStrictEqual([
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

    expect(await resolver.resolveReceptorLua("up")).toBe(expected)
  })
})

test("resolves external Lua files for arbitrary elements", async () => {
  await withSkin(async (directory) => {
    const expected = path.join(directory, "Down Tap Note.lua")
    await writeFile(expected, "return Def.Sprite {}")
    await writeFile(path.join(directory, "Up Tap Note.redir"), "Down Tap Note")

    const resolver = await createSkinFileResolver(directory)

    expect(await resolver.resolveElementLua("down", "Tap Note")).toBe(expected)
    expect(await resolver.resolveElementLua("up", "Tap Note")).toBe(expected)
  })
})

test("applies cycle and skin-boundary checks to arbitrary elements", async () => {
  await withSkin(async (directory) => {
    await writeFile(path.join(directory, "Up Tap Note.redir"), "Down Tap Note")
    await writeFile(path.join(directory, "Down Tap Note.redir"), "Up Tap Note")

    const resolver = await createSkinFileResolver(directory)

    await expect((() => resolver.resolveElementLua("up", "Tap Note"))()).rejects.toThrow(/cycle/i)
  })

  await withSkin(async (directory) => {
    await writeFile(path.join(directory, "Down Tap Note.redir"), "../outside")

    const resolver = await createSkinFileResolver(directory)

    await expect((() => resolver.resolveElementLua("down", "Tap Note"))()).rejects.toThrow(
      /outside the skin/i,
    )
  })
})

test("rejects redirection cycles", async () => {
  await withSkin(async (directory) => {
    await writeFile(path.join(directory, "Up Receptor.redir"), "Down Receptor")
    await writeFile(path.join(directory, "Down Receptor.redir"), "Up Receptor")

    const resolver = await createSkinFileResolver(directory)

    await expect((() => resolver.resolveReceptorLua("up"))()).rejects.toThrow(/cycle/i)
  })
})

test("does not resolve paths outside the skin", async () => {
  await withSkin(async (directory) => {
    await writeFile(path.join(directory, "Down Receptor.redir"), "../outside")

    const resolver = await createSkinFileResolver(directory)

    await expect((() => resolver.resolveReceptorLua("down"))()).rejects.toThrow(/outside the skin/i)
    expect(resolver.resolveAssets("../outside")).toStrictEqual([])
  })
})
