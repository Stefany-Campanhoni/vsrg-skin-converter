import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { removeOsuTemplateArtifacts } from "./remove-osu-template-artifacts.ts"

test("removes internal template artifacts and preserves generated assets", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-cleanup-"))
  const artifacts = ["receptor-base.png", "LNB.png", "LNT.png"]
  try {
    await mkdir(path.join(workspace, "mania", "lns"), { recursive: true })
    await Promise.all(
      artifacts.map((filename) => writeFile(path.join(workspace, filename), filename)),
    )
    await writeFile(path.join(workspace, "skin.ini"), "skin")
    await writeFile(path.join(workspace, "arbitrary-root-sentinel.keep"), "sentinel")
    await writeFile(path.join(workspace, "mania", "lns", "body.png"), "body")

    await removeOsuTemplateArtifacts(workspace)

    for (const filename of artifacts) {
      await assert.rejects(() => readFile(path.join(workspace, filename)), { code: "ENOENT" })
    }
    assert.equal(await readFile(path.join(workspace, "skin.ini"), "utf8"), "skin")
    assert.equal(
      await readFile(path.join(workspace, "arbitrary-root-sentinel.keep"), "utf8"),
      "sentinel",
    )
    assert.equal(await readFile(path.join(workspace, "mania", "lns", "body.png"), "utf8"), "body")
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test("waits for every artifact removal before rethrowing the exact removal failure", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-cleanup-"))
  const sibling = deferred<void>()
  const removalsStarted = deferred<void>()
  const failure = new Error("exact removal failure")
  let calls = 0
  try {
    const removing = removeOsuTemplateArtifacts(workspace, {
      removeArtifact: async () => {
        calls += 1
        if (calls === 3) {
          removalsStarted.resolve()
        }
        if (calls === 1) {
          return sibling.promise
        }
        if (calls === 2) {
          throw failure
        }
      },
    })

    const phase = await Promise.race([
      removalsStarted.promise.then(() => "started"),
      removing.then(
        () => "completed",
        () => "rejected",
      ),
    ])
    assert.equal(phase, "started")

    let settled = false
    void removing.catch(() => {
      settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)

    sibling.resolve()
    await assert.rejects(removing, (error) => error === failure)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test("starts every removal when an injected remover throws synchronously", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-cleanup-"))
  const sibling = deferred<void>()
  const removalsStarted = deferred<void>()
  const failure = new Error("synchronous removal failure")
  let calls = 0
  try {
    const removing = removeOsuTemplateArtifacts(workspace, {
      removeArtifact: () => {
        calls += 1
        if (calls === 3) {
          removalsStarted.resolve()
        }
        if (calls === 1) {
          return sibling.promise
        }
        if (calls === 2) {
          throw failure
        }
        return Promise.resolve()
      },
    })

    const phase = await Promise.race([
      removalsStarted.promise.then(() => "started"),
      removing.then(
        () => "completed",
        () => "rejected",
      ),
    ])
    assert.equal(phase, "started")
    assert.equal(calls, 3)
    let settled = false
    void removing.catch(() => {
      settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)

    sibling.resolve()
    await assert.rejects(removing, (error) => error === failure)
  } finally {
    await rm(workspace, { recursive: true, force: true })
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

test("rejects when an expected internal artifact cannot be removed", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-cleanup-"))
  try {
    await assert.rejects(() => removeOsuTemplateArtifacts(workspace), { code: "ENOENT" })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
