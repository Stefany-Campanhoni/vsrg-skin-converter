import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { copyDirectory } from "./copy-directory.ts"

test("waits for every entry copy before rethrowing the exact copy failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-copy-directory-"))
  const source = path.join(root, "source")
  const target = path.join(root, "target")
  const sibling = deferred<void>()
  const copiesStarted = deferred<void>()
  const failure = new Error("copy failed")
  let calls = 0
  try {
    await mkdir(source)
    await writeFile(path.join(source, "a.txt"), "a")
    await writeFile(path.join(source, "b.txt"), "b")

    const copying = copyDirectory(source, target, {
      copyEntry: async (sourcePath) => {
        calls += 1
        if (calls === 2) {
          copiesStarted.resolve()
        }
        if (path.basename(sourcePath) === "a.txt") {
          return sibling.promise
        }
        throw failure
      },
    })

    const phase = await Promise.race([
      copiesStarted.promise.then(() => "started"),
      copying.then(
        () => "completed",
        () => "rejected",
      ),
    ])
    assert.equal(phase, "started")

    let settled = false
    void copying.catch(() => {
      settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)

    sibling.resolve()
    await assert.rejects(copying, (error) => error === failure)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
