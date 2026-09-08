import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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

    expect(await readdir(target)).toStrictEqual(["fresh.txt"])
    expect(await readFile(path.join(target, "fresh.txt"), "utf8")).toBe("fresh")
    expect(await readdir(parent)).toStrictEqual(["output"])
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

    await expect(
      (() =>
        new TransactionalOutputPublisher().publish(target, async (workspace) => {
          await writeFile(path.join(workspace, "partial.txt"), "partial")
          throw new Error("build failed")
        }))(),
    ).rejects.toThrow(/build failed/)

    expect(await readdir(target)).toStrictEqual(["current.txt"])
    expect(await readdir(parent)).toStrictEqual(["output"])
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test("rejects filesystem roots as publication targets", async () => {
  const root = path.parse(process.cwd()).root

  await expect(
    (() =>
      new TransactionalOutputPublisher().publish(root, async () => {
        throw new Error("should not build")
      }))(),
  ).rejects.toThrow(/unsafe output target/i)
})
