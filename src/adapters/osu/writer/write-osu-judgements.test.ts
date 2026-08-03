import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  type JudgementGrade,
  type JudgementSet,
  judgementGrades,
} from "../../../domain/judgement.ts"
import type { JudgementImageVariants } from "../../../infrastructure/image/sharp-judgement-processor.ts"
import { writeOsuJudgements } from "./write-osu-judgements.ts"

const judgements: JudgementSet = {
  sourceDensity: 1,
  images: Object.fromEntries(
    judgementGrades.map((grade) => [grade, { filePath: grade, rotation: 0 }]),
  ) as JudgementSet["images"],
}

test("writes exact osu judgement filenames", async (t) => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-writer-"))
  t.after(() => rm(outputDirectory, { recursive: true, force: true }))

  const observedScales: number[] = []
  await writeOsuJudgements({
    judgements,
    outputDirectory,
    scale: 0.5125,
    render: async (definition, _sourceDensity, scale) => {
      observedScales.push(scale)
      const grade = definition.filePath as JudgementGrade
      return {
        standardResolution: Buffer.from(`sd-${grade}`),
        doubleResolution: Buffer.from(`hd-${grade}`),
      }
    },
  })

  assert.deepEqual((await readdir(path.join(outputDirectory, "mania", "judgements"))).sort(), [
    "bad.png",
    "bad@2x.png",
    "good.png",
    "good@2x.png",
    "great.png",
    "great@2x.png",
    "marvelous.png",
    "marvelous@2x.png",
    "miss.png",
    "miss@2x.png",
    "perfect.png",
    "perfect@2x.png",
  ])
  assert.deepEqual(observedScales, [0.5125, 0.5125, 0.5125, 0.5125, 0.5125, 0.5125])
})

test("waits for all renders and writes nothing when rendering fails", async (t) => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-writer-"))
  t.after(() => rm(outputDirectory, { recursive: true, force: true }))
  const sibling = deferred<JudgementImageVariants>()
  const failureStarted = deferred<void>()
  const failure = new Error("exact judgement render failure")
  let calls = 0

  const writing = writeOsuJudgements({
    judgements,
    outputDirectory,
    scale: 1,
    render: async () => {
      calls += 1
      if (calls === 1) {
        return sibling.promise
      }
      if (calls === 2) {
        failureStarted.resolve()
        throw failure
      }
      return {
        standardResolution: Buffer.from("sd"),
        doubleResolution: Buffer.from("hd"),
      }
    },
  })
  let settled = false
  void writing.catch(() => {
    settled = true
  })

  await failureStarted.promise
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(settled, false)

  sibling.resolve({
    standardResolution: Buffer.from("sd"),
    doubleResolution: Buffer.from("hd"),
  })
  await assert.rejects(writing, (error) => error === failure)
  assert.deepEqual(await readdir(outputDirectory), [])
})

test("waits for all writes before rejecting with the first write failure", async (t) => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-writer-"))
  t.after(() => rm(outputDirectory, { recursive: true, force: true }))
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact judgement write failure")
  let calls = 0

  const writing = writeOsuJudgements({
    judgements,
    outputDirectory,
    scale: 1,
    render: async () => ({
      standardResolution: Buffer.from("sd"),
      doubleResolution: Buffer.from("hd"),
    }),
    write: async () => {
      calls += 1
      if (calls === 12) {
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
})

test("starts all writes and waits for siblings when a writer throws synchronously", async (t) => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-writer-"))
  t.after(() => rm(outputDirectory, { recursive: true, force: true }))
  const sibling = deferred<void>()
  const writesStarted = deferred<void>()
  const failure = new Error("exact synchronous judgement write failure")
  let calls = 0

  const writing = writeOsuJudgements({
    judgements,
    outputDirectory,
    scale: 1,
    render: async () => ({
      standardResolution: Buffer.from("sd"),
      doubleResolution: Buffer.from("hd"),
    }),
    write: () => {
      calls += 1
      if (calls === 12) {
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
  assert.equal(calls, 12)

  let settled = false
  void writing.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  await Promise.resolve()
  assert.equal(settled, false)

  sibling.resolve()
  await assert.rejects(writing, (error) => error === failure)
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
