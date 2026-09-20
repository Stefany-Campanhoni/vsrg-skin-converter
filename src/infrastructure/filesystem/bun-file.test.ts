import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { copyFileContents, readBinaryFile, readTextFile, writeFileContents } from "./bun-file.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

test("reads and writes exact text and binary file contents", async () => {
  const root = await createTemporaryDirectory()
  const textPath = path.join(root, "text.txt")
  const binaryPath = path.join(root, "binary.bin")

  await writeFileContents(textPath, "Olá, Bun")
  await writeFileContents(binaryPath, new Uint8Array([0, 127, 255]))

  expect(await readTextFile(textPath)).toBe("Olá, Bun")
  expect(await readBinaryFile(binaryPath)).toEqual(new Uint8Array([0, 127, 255]))
})

test("copies one file byte-for-byte over an existing destination", async () => {
  const root = await createTemporaryDirectory()
  const source = path.join(root, "source.bin")
  const destination = path.join(root, "destination.bin")
  await writeFileContents(source, new Uint8Array([10, 20, 30]))
  await writeFileContents(destination, "old")

  await copyFileContents(source, destination)

  expect([...(await readFile(destination))]).toEqual([10, 20, 30])
})

test("preserves ENOENT for missing Bun file reads", async () => {
  const root = await createTemporaryDirectory()

  await expect(readBinaryFile(path.join(root, "missing.bin"))).rejects.toMatchObject({
    code: "ENOENT",
  })
})

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-bun-file-"))
  temporaryDirectories.push(directory)
  return directory
}
