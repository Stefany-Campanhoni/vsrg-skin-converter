import { expect, test } from "bun:test"
import type {
  ReadableDirectoryHandle,
  ReadableSourceFile,
} from "../../application/ports/source-files.ts"
import { createDirectoryHandleSourceFiles } from "./directory-handle-source-files.ts"
import { createFileListSourceFiles } from "./file-list-source-files.ts"
import { createRegisteredAssetLoader } from "./registered-asset-loader.ts"

function file(
  relative: string,
  read: () => Promise<ArrayBuffer> = async () => new TextEncoder().encode("skin").buffer,
): ReadableSourceFile {
  return {
    name: relative.split("/").at(-1) ?? "",
    webkitRelativePath: relative,
    size: 4,
    arrayBuffer: read,
  }
}

test("repeated small directory lookups stay fast in a large installation", async () => {
  const source = createFileListSourceFiles([
    file("Etterna/NoteSkins/dance/Foo/NoteSkin.lua"),
    ...Array.from({ length: 60000 }, (_, index) => file(`Etterna/Songs/Pack/${index}/chart.sm`)),
  ])
  const started = performance.now()
  for (let index = 0; index < 2000; index++)
    expect(await source.list("NoteSkins/dance")).toEqual([{ name: "Foo", kind: "directory" }])
  // This generous budget detects rescanning unrelated Songs on every lookup.
  expect(performance.now() - started).toBeLessThan(1000)
}, 30000)

test("file-list indexing keeps ambiguities local to the requested directory", async () => {
  const source = createFileListSourceFiles([
    file("Root/NoteSkins/dance/Foo/NoteSkin.lua"),
    file("Root/Songs/Conflict"),
    file("Root/Songs/Conflict/chart.sm"),
    file("Root/Other/A.png"),
    file("Root/Other/a.png"),
  ])
  expect(await source.list("NoteSkins/dance")).toEqual([{ name: "Foo", kind: "directory" }])
  await expect(source.list("Songs")).rejects.toThrow("Ambiguous")
  await expect(source.list("Other")).rejects.toThrow("ambiguous ignoring case")
  await expect(source.list("missing")).rejects.toThrow("not found")
})
test("directory file input strips one common root and reads only requested bytes", async () => {
  let unrelatedReads = 0
  const source = createFileListSourceFiles([
    file("Etterna/NoteSkins/dance/Foo/NoteSkin.lua"),
    file("Etterna/Songs/private.txt", async () => {
      unrelatedReads++
      throw new Error("must not read")
    }),
  ])
  expect(await source.list("NoteSkins/dance")).toEqual([{ name: "Foo", kind: "directory" }])
  expect(new TextDecoder().decode(await source.readBytes("NoteSkins/dance/Foo/NoteSkin.lua"))).toBe(
    "skin",
  )
  expect(unrelatedReads).toBe(0)
})
test("sources reject traversal, mixed roots, duplicate files and oversized reads", async () => {
  expect(() => createFileListSourceFiles([file("Root/../secret.txt")])).toThrow(/path/)
  expect(() => createFileListSourceFiles([file("A/file"), file("B/file")])).toThrow(/root/)
  expect(() => createFileListSourceFiles([file("A/file"), file("A/file")])).toThrow(/Duplicate/)
  const source = createFileListSourceFiles([{ ...file("Root/image.png"), size: 33 * 1024 * 1024 }])
  await expect(source.readBytes("image.png")).rejects.toThrow(/32 MiB/)
  await expect(source.readBytes("../secret")).rejects.toThrow(/path/)
})
test("registered asset loader rejects foreign identities and releases selected sources", async () => {
  const source = createFileListSourceFiles([file("Root/image.png")])
  const loader = createRegisteredAssetLoader()
  loader.register(source)
  expect(await loader.read(source.assetId("image.png"))).toEqual(new TextEncoder().encode("skin"))
  await expect(loader.read("C:/private.png")).rejects.toThrow(/registered/)
  const asset = source.assetId("image.png")
  loader.clear()
  await expect(loader.read(asset)).rejects.toThrow(/registered/)
})
test("handle source preserves permission failures and uses read-only traversal", async () => {
  const denied = new DOMException("Permission revoked", "NotAllowedError")
  const handle: ReadableDirectoryHandle = {
    kind: "directory",
    name: "Root",
    async *values() {
      yield {
        kind: "file" as const,
        name: "image.png",
        async getFile() {
          throw denied
        },
      }
    },
    async getDirectoryHandle() {
      throw new Error("No directory")
    },
    async getFileHandle() {
      return {
        kind: "file",
        name: "image.png",
        async getFile() {
          throw denied
        },
      }
    },
  }
  const source = createDirectoryHandleSourceFiles(handle)
  expect(await source.list("")).toEqual([{ name: "image.png", kind: "file" }])
  await expect(source.readBytes("image.png")).rejects.toBe(denied)
})
