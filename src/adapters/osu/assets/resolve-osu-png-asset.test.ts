import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { type ResolveOsuPngAssetDependencies, resolveOsuPngAsset } from "./resolve-osu-png-asset.ts"

async function withSkin(run: (skinDirectory: string) => Promise<void>): Promise<void> {
  const skinDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-png-")))
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

function resolve(skinDirectory: string, logicalPath: string, useDoubleResolutionAssets = false) {
  return resolveOsuPngAsset({ skinDirectory, logicalPath, useDoubleResolutionAssets })
}

test("selects the unsuffixed PNG for an implicit standard-density reference", async () => {
  await withSkin(async (skinDirectory) => {
    const expected = await writePng(skinDirectory, "Notes/Pink.png")
    await writePng(skinDirectory, "Notes/Pink@2x.png")

    const asset = await resolve(skinDirectory, "notes\\pink")

    assert.equal(asset.filePath, expected)
    assert.equal(asset.pixelDensity, "standard")
    assert.equal(asset.rotation, 0)
    assert.equal(asset.frame, undefined)
  })
})

test("selects the @2x PNG for an implicit double-density reference", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "Notes/Pink.png")
    const expected = await writePng(skinDirectory, "Notes/Pink@2x.png")

    const asset = await resolve(skinDirectory, "notes\\pink", true)

    assert.equal(asset.filePath, expected)
    assert.equal(asset.pixelDensity, "double")
  })
})

test("uses an explicit @2x reference in standard mode", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "Notes/Pink.png")
    const expected = await writePng(skinDirectory, "Notes/Pink@2x.png")

    const asset = await resolve(skinDirectory, "notes\\pink@2x")

    assert.equal(asset.filePath, expected)
    assert.equal(asset.pixelDensity, "double")
  })
})

test("does not fall back from an unavailable selected density", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "Notes/Pink.png")

    await assert.rejects(() => resolve(skinDirectory, "notes/pink", true), /pink@2x\.png/i)
  })
})

test("does not fall back to @2x when standard density is selected", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "Notes/Pink@2x.png")

    await assert.rejects(() => resolve(skinDirectory, "notes/pink"), /pink\.png/i)
  })
})

test("an explicit @2x reference never falls back even in high-resolution mode", async () => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "Notes/Pink.png")

    await assert.rejects(() => resolve(skinDirectory, "notes/pink@2x", true), /pink@2x\.png/i)
  })
})

test("rejects non-PNG extensions before accessing the skin", async () => {
  await withSkin(async (skinDirectory) => {
    await assert.rejects(() => resolve(skinDirectory, "notes/pink.jpg"), /PNG.*\.jpg/i)
    await assert.rejects(() => resolve(skinDirectory, "notes/pink.jpeg"), /PNG.*\.jpeg/i)
  })
})

test("rejects absolute and traversal logical paths", async () => {
  await withSkin(async (skinDirectory) => {
    await assert.rejects(() => resolve(skinDirectory, "/notes/pink"), /absolute/i)
    await assert.rejects(() => resolve(skinDirectory, "C:\\notes\\pink"), /absolute/i)
    await assert.rejects(() => resolve(skinDirectory, "notes/../pink"), /traversal/i)
  })
})

test("resolves mixed-case physical path segments case-insensitively", async () => {
  await withSkin(async (skinDirectory) => {
    const expected = await writePng(skinDirectory, "NoTeS/PiNk.PnG")

    const asset = await resolve(skinDirectory, "notes/pink")

    assert.equal(asset.filePath, expected)
  })
})

test("rejects ambiguous case-insensitive file matches", async (t) => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "Notes/Pink.png")
    await writePng(skinDirectory, "Notes/PINK.png")
    const entries = await readdir(path.join(skinDirectory, "Notes"))
    if (entries.length < 2) {
      t.skip("The current filesystem treats case-only filenames as identical")
      return
    }

    await assert.rejects(() => resolve(skinDirectory, "notes/pink"), /ambiguous.*pink/i)
  })
})

test("rejects ambiguous case-insensitive directory segments", async (t) => {
  await withSkin(async (skinDirectory) => {
    await writePng(skinDirectory, "Notes/Pink.png")
    await writePng(skinDirectory, "NOTES/Other.png")
    const entries = await readdir(skinDirectory)
    if (entries.length < 2) {
      t.skip("The current filesystem treats case-only directory names as identical")
      return
    }

    await assert.rejects(() => resolve(skinDirectory, "notes/pink"), /ambiguous.*notes/i)
  })
})

test("rejects a directory selected in place of a PNG file", async () => {
  await withSkin(async (skinDirectory) => {
    await mkdir(path.join(skinDirectory, "Notes", "Pink.png"), { recursive: true })

    await assert.rejects(() => resolve(skinDirectory, "notes/pink"), /regular file/i)
  })
})

test("rejects a selected symlink whose real target escapes the skin", async (t) => {
  await withSkin(async (skinDirectory) => {
    const outsideDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-outside-"))
    try {
      const outsidePng = await writePng(outsideDirectory, "Pink.png")
      await mkdir(path.join(skinDirectory, "Notes"), { recursive: true })
      try {
        await symlink(outsidePng, path.join(skinDirectory, "Notes", "Pink.png"), "file")
      } catch (error) {
        if (isSymlinkPermissionError(error)) {
          t.skip("Creating symlinks requires unavailable Windows privileges")
          return
        }
        throw error
      }

      await assert.rejects(() => resolve(skinDirectory, "notes/pink"), /outside the skin/i)
    } finally {
      await rm(outsideDirectory, { recursive: true, force: true })
    }
  })
})

test("rejects an intermediate directory symlink that escapes the skin", async (t) => {
  await withSkin(async (skinDirectory) => {
    const outsideDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-outside-"))
    try {
      await writePng(outsideDirectory, "Pink.png")
      try {
        await symlink(
          outsideDirectory,
          path.join(skinDirectory, "Notes"),
          process.platform === "win32" ? "junction" : "dir",
        )
      } catch (error) {
        if (isSymlinkPermissionError(error)) {
          t.skip("Creating symlinks requires unavailable Windows privileges")
          return
        }
        throw error
      }

      await assert.rejects(() => resolve(skinDirectory, "notes/pink"), /outside the skin/i)
    } finally {
      await rm(outsideDirectory, { recursive: true, force: true })
    }
  })
})

test("preserves the exact root realpath failure as the contextual error cause", async () => {
  const failure = new Error("exact root realpath failure")

  await assertBoundaryCause(
    () =>
      resolveOsuPngAsset(
        assetOptions(),
        resolverDependencies({ realpath: async () => Promise.reject(failure) }),
      ),
    /skin root is unavailable/i,
    failure,
  )
})

test("preserves the exact directory read failure as the contextual error cause", async () => {
  const failure = new Error("exact directory read failure")

  await assertBoundaryCause(
    () =>
      resolveOsuPngAsset(
        assetOptions(),
        resolverDependencies({ readdir: async () => Promise.reject(failure) }),
      ),
    /cannot read.*virtual-skin/i,
    failure,
  )
})

test("preserves the exact candidate realpath failure as the contextual error cause", async () => {
  const failure = new Error("exact candidate realpath failure")
  let calls = 0

  await assertBoundaryCause(
    () =>
      resolveOsuPngAsset(
        assetOptions(),
        resolverDependencies({
          realpath: async (candidate) => {
            calls += 1
            if (calls === 2) {
              throw failure
            }
            return candidate
          },
        }),
      ),
    /cannot resolve.*Pink\.png/i,
    failure,
  )
})

test("preserves the exact stat failure as the contextual error cause", async () => {
  const failure = new Error("exact stat failure")

  await assertBoundaryCause(
    () =>
      resolveOsuPngAsset(
        assetOptions(),
        resolverDependencies({ stat: async () => Promise.reject(failure) }),
      ),
    /cannot inspect.*Pink\.png/i,
    failure,
  )
})

function assetOptions() {
  return {
    skinDirectory: path.resolve("virtual-skin"),
    logicalPath: "Pink",
    useDoubleResolutionAssets: false,
  }
}

function resolverDependencies(
  overrides: Partial<ResolveOsuPngAssetDependencies> = {},
): ResolveOsuPngAssetDependencies {
  return {
    realpath: async (candidate) => candidate,
    readdir: async () => ["Pink.png"],
    stat: async () => ({ isFile: () => true, isDirectory: () => false }),
    ...overrides,
  }
}

async function assertBoundaryCause(
  operation: () => Promise<unknown>,
  message: RegExp,
  failure: Error,
): Promise<void> {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, message)
    assert.equal(error.cause, failure)
    return true
  })
}

function isSymlinkPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM"
}
