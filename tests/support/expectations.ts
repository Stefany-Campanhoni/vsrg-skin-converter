import { expect } from "bun:test"

export function expectTruthy(value: unknown, message?: string): asserts value {
  expect(value, message).toBeTruthy()
}

export async function expectRejectionSatisfies(
  received: PromiseLike<unknown> | (() => PromiseLike<unknown>),
  predicate: (value: unknown) => boolean,
  message?: string,
): Promise<void> {
  try {
    await (typeof received === "function" ? received() : received)
  } catch (error) {
    expect(predicate(error), message ?? "Rejected value did not satisfy the predicate").toBe(true)
    return
  }
  throw new Error(message ?? "Expected promise to reject")
}

export async function expectResolves(
  received: PromiseLike<unknown> | (() => PromiseLike<unknown>),
): Promise<void> {
  await (typeof received === "function" ? received() : received)
}
