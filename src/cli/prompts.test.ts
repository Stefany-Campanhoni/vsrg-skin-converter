import { expect, test } from "bun:test"
import { askConfirm, waitForAnyKey } from "./prompts.ts"

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

test("writes a pause message with Bun output and skips raw mode for redirected input", async () => {
  const writes: string[] = []
  let rawModeChanged = false

  await waitForAnyKey("Press any key", {
    write: async (message) => {
      writes.push(message)
    },
    input: {
      isTTY: false,
      setRawMode: () => {
        rawModeChanged = true
      },
      resume: () => {},
      once: () => {},
      pause: () => {},
    },
  })

  expect(writes).toEqual(["Press any key\n"])
  expect(rawModeChanged).toBe(false)
})

test("waits for TTY input and restores raw mode after one key", async () => {
  const events: string[] = []
  const listeners: Array<() => void> = []
  const waiting = waitForAnyKey("Continue", {
    write: async (message) => {
      events.push(`write:${message}`)
    },
    input: {
      isTTY: true,
      setRawMode: (enabled) => {
        events.push(`raw:${enabled}`)
      },
      resume: () => {
        events.push("resume")
      },
      once: (event, listener) => {
        events.push(`once:${event}`)
        listeners.push(listener)
      },
      pause: () => {
        events.push("pause")
      },
    },
  })

  await Promise.resolve()
  await Promise.resolve()
  expect(events).toEqual(["write:Continue\n", "raw:true", "resume", "once:data"])
  const listener = listeners[0]
  if (!listener) throw new Error("Expected the data listener to be registered")
  listener()
  await waiting

  expect(events).toEqual([
    "write:Continue\n",
    "raw:true",
    "resume",
    "once:data",
    "raw:false",
    "pause",
  ])
})
