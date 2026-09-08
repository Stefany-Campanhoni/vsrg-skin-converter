import { expect, test } from "bun:test"
import { expectRejectionSatisfies, expectResolves } from "./expectations.ts"

test("validates the exact rejection value", async () => {
  const failure = new Error("failure")
  await expectRejectionSatisfies(Promise.reject(failure), (error) => error === failure)
})

test("invokes a promise factory before validating its rejection", async () => {
  const failure = new Error("factory failure")
  await expectRejectionSatisfies(
    () => Promise.reject(failure),
    (error) => error === failure,
  )
})

test("fails when the rejection does not satisfy the predicate", async () => {
  await expect(
    expectRejectionSatisfies(Promise.reject(new Error("wrong")), () => false),
  ).rejects.toThrow(/did not satisfy/i)
})

test("fails when the promise fulfills", async () => {
  await expect(expectRejectionSatisfies(Promise.resolve("value"), () => true)).rejects.toThrow(
    /expected.*reject/i,
  )
})

test("waits until a successful promise settles", async () => {
  let settled = false
  const resolution = Promise.resolve().then(() => {
    settled = true
  })

  await expectResolves(resolution)

  expect(settled).toBe(true)
})
