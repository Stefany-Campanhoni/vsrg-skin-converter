import { test } from "bun:test"
import assert from "node:assert/strict"
import { askConfirm } from "./prompts.ts"

test("returns explicit confirmation choices unchanged", async () => {
  for (const choice of [true, false] as const) {
    let receivedMessage: string | undefined
    const result = await askConfirm("Replace the existing NoteSkin?", {
      confirm: async ({ message }) => {
        receivedMessage = message
        return choice
      },
      isCancel: () => false,
      cancel: () => assert.fail("explicit choices must not cancel the prompt flow"),
    })

    assert.equal(result, choice)
    assert.equal(receivedMessage, "Replace the existing NoteSkin?")
  }
})

test("uses the standard cancellation path when confirmation is cancelled", async () => {
  const cancellation = Symbol("cancelled")
  let cancellationMessage: string | undefined

  const result = await askConfirm("Replace the existing NoteSkin?", {
    confirm: async () => cancellation,
    isCancel: (value) => value === cancellation,
    cancel: (message) => {
      cancellationMessage = message
    },
  })

  assert.equal(result, undefined)
  assert.equal(cancellationMessage, "bye bye...")
})
