import { expect, onTestFinished, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { hashFileSha256 } from "../../.ci/runtime/hash-file.ts"

test("hashes file contents as a lowercase streaming SHA-256 digest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-hash-file-test-"))
  onTestFinished(() => rm(root, { recursive: true }))
  const file = path.join(root, "fixture.bin")
  await writeFile(file, new Uint8Array([97, 98, 99]))

  expect(await hashFileSha256(file)).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  )
})
