import { expect, test } from "bun:test"
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
      cancel: () =>
        (() => {
          throw new Error("explicit choices must not cancel the prompt flow")
        })(),
    })

    expect(result).toBe(choice)
    expect(receivedMessage).toBe("Replace the existing NoteSkin?")
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

  expect(result).toBe(undefined)
  expect(cancellationMessage).toBe("bye bye...")
})
