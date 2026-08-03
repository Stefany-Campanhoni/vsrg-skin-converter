import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import type { ImageAsset, TapNoteSet } from "../../../domain/image.ts"
import { writeOsuNotes } from "./write-osu-notes.ts"

const image: ImageAsset = { filePath: "source.png", rotation: 0 }
const notes: TapNoteSet = {
  left: image,
  down: image,
  up: image,
  right: image,
}

test("writes every note using the names referenced by the osu template", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-note-writer-"))
  try {
    await writeOsuNotes({
      notes,
      outputDirectory,
      render: async () => Buffer.from("png"),
    })

    const names = await readdir(path.join(outputDirectory, "mania", "notes"))
    assert.deepEqual(names.sort(), ["down.png", "left.png", "right.png", "up.png"])
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("does not create note output when any render fails", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-note-writer-"))
  let calls = 0
  try {
    await assert.rejects(
      () =>
        writeOsuNotes({
          notes,
          outputDirectory,
          render: async () => {
            calls += 1
            if (calls === 3) {
              throw new Error("render failed")
            }
            return Buffer.from("png")
          },
        }),
      /render failed/,
    )

    assert.deepEqual(await readdir(outputDirectory), [])
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("waits for every note render before rethrowing the exact render failure", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-note-writer-"))
  const sibling = deferred<Buffer>()
  const failureStarted = deferred<void>()
  const failure = new Error("exact render failure")
  let calls = 0
  try {
    const writing = writeOsuNotes({
      notes,
      outputDirectory,
      render: async () => {
        calls += 1
        if (calls === 1) {
          return sibling.promise
        }
        if (calls === 2) {
          failureStarted.resolve()
          throw failure
        }
        return Buffer.from("png")
      },
    })
    let settled = false
    void writing.catch(() => {
      settled = true
    })

    await failureStarted.promise
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(settled, false)

    sibling.resolve(Buffer.from("png"))
    await assert.rejects(writing, (error) => error === failure)
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("waits for every note write before rethrowing the exact write failure", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-note-writer-"))
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact write failure")
  let calls = 0
  try {
    const writing = writeOsuNotes({
      notes,
      outputDirectory,
      render: async () => Buffer.from("png"),
      write: async () => {
        calls += 1
        if (calls === 4) {
          writesStarted.resolve()
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
      writesStarted.promise.then(() => "started"),
      writing.then(
        () => "completed",
        () => "rejected",
      ),
    ])
    assert.equal(phase, "started")

    let settled = false
    void writing.catch(() => {
      settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)

    sibling.resolve()
    await assert.rejects(writing, (error) => error === failure)
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test("starts every note write and waits for siblings after a synchronous failure", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-note-writer-"))
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact synchronous note write failure")
  let calls = 0
  try {
    const writing = writeOsuNotes({
      notes,
      outputDirectory,
      render: async () => Buffer.from("png"),
      write: () => {
        calls += 1
        if (calls === 4) {
          writesStarted.resolve()
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
      writesStarted.promise.then(() => "started"),
      writing.then(
        () => "completed",
        () => "rejected",
      ),
    ])
    assert.equal(phase, "started")
    assert.equal(calls, 4)
    let settled = false
    void writing.catch(() => {
      settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)

    sibling.resolve()
    await assert.rejects(writing, (error) => error === failure)
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
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
