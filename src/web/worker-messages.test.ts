import { expect, test } from "bun:test"
import { isWorkerReply } from "./worker-messages.ts"

test("worker transport validates complete payloads before controllers receive them", () => {
  for (const value of [
    null,
    { kind: "success", requestId: 1 },
    { kind: "preview", requestId: 1, preview: {} },
    {
      kind: "progress",
      requestId: 1,
      progress: { phase: "rendering", completed: "bad", total: 1 },
    },
    { kind: "failure", requestId: 1, message: 42 },
  ])
    expect(isWorkerReply(value)).toBe(false)
  expect(isWorkerReply({ kind: "ready", requestId: 0 })).toBe(true)
  expect(
    isWorkerReply({
      kind: "success",
      requestId: 1,
      result: { archive: new Uint8Array(), filename: "result.zip", diagnostics: [] },
    }),
  ).toBe(true)
})
