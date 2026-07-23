import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { TransactionalOutputPublisher } from "./transactional-output-publisher.ts"

test("fully replaces the previous output after a successful build", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "vsrg-publisher-"))
  const target = path.join(parent, "output")
  try {
    await mkdir(target)
    await writeFile(path.join(target, "stale.txt"), "stale")

    await new TransactionalOutputPublisher().publish(target, async (workspace) => {
      await writeFile(path.join(workspace, "fresh.txt"), "fresh")
    })

    assert.deepEqual(await readdir(target), ["fresh.txt"])
    assert.equal(await readFile(path.join(target, "fresh.txt"), "utf8"), "fresh")
    assert.deepEqual(await readdir(parent), ["output"])
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test("preserves the previous output when the staged build fails", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "vsrg-publisher-"))
  const target = path.join(parent, "output")
  try {
    await mkdir(target)
    await writeFile(path.join(target, "current.txt"), "current")

    await assert.rejects(
      () =>
        new TransactionalOutputPublisher().publish(target, async (workspace) => {
          await writeFile(path.join(workspace, "partial.txt"), "partial")
          throw new Error("build failed")
        }),
      /build failed/,
    )

    assert.deepEqual(await readdir(target), ["current.txt"])
    assert.deepEqual(await readdir(parent), ["output"])
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test("rejects filesystem roots as publication targets", async () => {
  const root = path.parse(process.cwd()).root

  await assert.rejects(
    () =>
      new TransactionalOutputPublisher().publish(root, async () => {
        throw new Error("should not build")
      }),
    /unsafe output target/i,
  )
})
