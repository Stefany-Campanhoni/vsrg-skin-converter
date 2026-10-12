import { expect, test } from "bun:test"
import { createConversionController } from "./conversion-controller.ts"
import type { ConversionWorkerTransport } from "./conversion-worker-transport.ts"
import type { WebConversionRequest, WorkerCommand, WorkerReply } from "./worker-messages.ts"

test("repeated reset waits for one disposal and initializes only one replacement", async () => {
  let release: (() => void) | undefined
  let created = 0
  const controller = createConversionController(() => {
    created++
    return {
      postMessage() {},
      subscribe() {
        return () => {}
      },
      dispose: () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    }
  })
  controller.initialize()
  const first = controller.reset(),
    second = controller.reset()
  expect(created).toBe(1)
  release?.()
  await Promise.all([first, second])
  expect(created).toBe(2)
})

test("controller ignores stale work after reset and releases its worker", async () => {
  const commands: WorkerCommand[] = [],
    listeners = new Set<(reply: WorkerReply) => void>()
  let disposed = 0
  const transport: ConversionWorkerTransport = {
    postMessage: (command) => commands.push(command),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async dispose() {
      disposed++
    },
  }
  const controller = createConversionController(() => transport)
  controller.initialize()
  for (const listener of listeners) listener({ kind: "ready", requestId: 0 })
  const request: WebConversionRequest = {
    direction: "osu-to-etterna",
    source: { kind: "file-list", files: [] },
    skinName: "x",
    useDoubleResolutionAssets: false,
  }
  controller.review(request)
  const old = commands.at(-1)?.requestId ?? 0
  await controller.reset()
  for (const listener of listeners)
    listener({
      kind: "success",
      requestId: old,
      result: { archive: new Uint8Array(), filename: "x.zip", diagnostics: [] },
    })
  expect(controller.state.phase).toBe("initializing")
  expect(controller.state.result).toBeUndefined()
  expect(disposed).toBe(1)
})
test("controller requires reviewed values before conversion", () => {
  let listener: ((reply: WorkerReply) => void) | undefined
  const commands: WorkerCommand[] = []
  const controller = createConversionController(() => ({
    postMessage: (command) => commands.push(command),
    subscribe(callback) {
      listener = callback
      return () => {}
    },
    async dispose() {},
  }))
  controller.initialize()
  listener?.({ kind: "ready", requestId: 0 })
  expect(controller.state.phase).toBe("idle")
  controller.review({
    direction: "osu-to-etterna",
    source: { kind: "file-list", files: [] },
    skinName: "x",
    useDoubleResolutionAssets: false,
  })
  expect(() => controller.convert()).toThrow("review")
  listener?.({
    kind: "preview",
    requestId: commands[0]?.requestId ?? 0,
    preview: {
      playfield: {
        hitPosition: 0,
        judgementPosition: 0,
        comboPosition: 0,
        columnWidth: 100,
        comboScale: 1,
        judgementScale: 1,
      },
      diagnostics: [],
    },
  })
  controller.convert()
  expect(controller.state.phase).toBe("converting")
  expect(commands.at(-1)?.kind).toBe("convert")
})
