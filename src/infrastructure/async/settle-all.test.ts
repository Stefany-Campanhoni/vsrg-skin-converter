import { test } from "bun:test"
import assert from "node:assert/strict"
import { invokeAsPromise, settleAll } from "./settle-all.ts"

test("invokes a task immediately and converts a synchronous throw into a rejection", async () => {
  const failure = new Error("synchronous failure")
  let invoked = false

  const result = invokeAsPromise(() => {
    invoked = true
    throw failure
  })

  assert.equal(invoked, true)
  await assert.rejects(result, (error) => error === failure)
})

test("waits for every promise and preserves successful result order", async () => {
  const first = deferred<string>()
  const second = deferred<string>()
  const third = deferred<string>()
  const settlement = settleAll([first.promise, second.promise, third.promise])
  let settled = false
  void settlement.finally(() => {
    settled = true
  })

  third.resolve("third")
  second.resolve("second")
  await Promise.resolve()
  assert.equal(settled, false)

  first.resolve("first")
  assert.deepEqual(await settlement, ["first", "second", "third"])
})

test("waits for successful siblings before rethrowing the exact error object", async () => {
  const sibling = deferred<string>()
  const failure = new Error("exact failure")
  const settlement = settleAll([Promise.reject(failure), sibling.promise])
  let settled = false
  void settlement.catch(() => {
    settled = true
  })

  await Promise.resolve()
  assert.equal(settled, false)

  sibling.resolve("finished")
  await assert.rejects(settlement, (error) => error === failure)
})

test("rethrows the first input-order failure after every failure settles", async () => {
  const firstFailure = new Error("first input failure")
  const secondFailure = new Error("second input failure")
  const first = deferred<string>()
  const settlement = settleAll([first.promise, Promise.reject(secondFailure)])

  first.reject(firstFailure)

  await assert.rejects(settlement, (error) => error === firstFailure)
})

interface Deferred<T> {
  promise: Promise<T>
  reject(reason?: unknown): void
  resolve(value: T | PromiseLike<T>): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  let reject!: Deferred<T>["reject"]
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}
