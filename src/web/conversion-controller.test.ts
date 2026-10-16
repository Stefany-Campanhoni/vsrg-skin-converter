import { expect, test } from "bun:test"
import { createConversionController } from "./conversion-controller.ts"
import type { ConversionWorkerTransport } from "./conversion-worker-transport.ts"
import type {
  ConversionPreview,
  WebConversionRequest,
  WorkerCommand,
  WorkerReply,
} from "./worker-messages.ts"

function queuedReviewFixture(rejectPosting?: (command: WorkerCommand) => boolean) {
  let listener: ((reply: WorkerReply) => void) | undefined
  const commands: WorkerCommand[] = []
  const controller = createConversionController(() => ({
    postMessage: (command) => {
      commands.push(command)
      if (rejectPosting?.(command))
        throw new DOMException("Could not clone selection", "DataCloneError")
    },
    subscribe(callback) {
      listener = callback
      return () => {}
    },
    async dispose() {},
  }))
  controller.initialize()
  listener?.({ kind: "ready", requestId: 0 })
  const request: WebConversionRequest = {
    direction: "osu-to-etterna",
    source: { kind: "file-list", files: [] },
    skinName: "Reference",
    useDoubleResolutionAssets: false,
  }
  const preview: ConversionPreview = {
    artwork: [],
    diagnostics: [],
    playfield: {
      hitPosition: 432,
      judgementPosition: 244,
      comboPosition: 209,
      columnWidth: 68,
      comboScale: 1,
      judgementScale: 1,
    },
  }
  return {
    controller,
    commands,
    request,
    preview,
    reply: (value: WorkerReply) => listener?.(value),
  }
}

for (const completion of ["preview", "failure"] as const)
  test(`rapid review changes wait for the active ${completion} and publish only the latest selection`, () => {
    const { controller, commands, request, preview, reply } = queuedReviewFixture()
    controller.review(request)
    controller.review({ ...request, skinName: "Intermediate" })
    const latest = { ...request, skinName: "Latest", useDoubleResolutionAssets: true }
    controller.review(latest)
    expect(commands).toHaveLength(1)
    expect(controller.state.request).toEqual(latest)
    expect(() => controller.convert()).toThrow("review")
    reply(
      completion === "preview"
        ? { kind: "preview", requestId: 1, preview }
        : { kind: "failure", requestId: 1, message: "Obsolete selection failed" },
    )
    expect(controller.state.phase).toBe("review")
    expect(controller.state.preview).toBeUndefined()
    expect(controller.state.message).toBeUndefined()
    expect(commands).toEqual([
      { kind: "inspect", requestId: 1, request },
      { kind: "inspect", requestId: 3, request: latest },
    ])
    reply({ kind: "preview", requestId: 3, preview })
    expect(controller.state.preview).toEqual(preview)
    controller.convert()
    expect(commands.at(-1)).toEqual({ kind: "convert", requestId: 4, request: latest })
  })

test("reset drops queued previews before the active worker settles", async () => {
  const { controller, commands, request, preview, reply } = queuedReviewFixture()
  controller.review(request)
  controller.review({ ...request, useDoubleResolutionAssets: true })
  await controller.reset()
  reply({ kind: "preview", requestId: 1, preview })
  expect(commands).toHaveLength(1)
  expect(controller.state.phase).toBe("initializing")
  expect(controller.state.preview).toBeUndefined()
})

test("a queued transport failure settles Review and permits another selection", () => {
  const { controller, commands, request, preview, reply } = queuedReviewFixture(
    (command) =>
      command.kind === "inspect" &&
      command.request.direction === "osu-to-etterna" &&
      command.request.useDoubleResolutionAssets === true,
  )
  controller.review(request)
  controller.review({ ...request, useDoubleResolutionAssets: true })
  expect(() => reply({ kind: "preview", requestId: 1, preview })).not.toThrow()
  expect(controller.state.phase).toBe("error")
  expect(controller.state.message).toContain("Could not clone selection")
  controller.review(request)
  expect(commands.at(-1)).toEqual({ kind: "inspect", requestId: 3, request })
  reply({ kind: "preview", requestId: 3, preview })
  controller.convert()
  expect(controller.state.phase).toBe("converting")
})

test("global worker failure blocks live review until reset and drops pending selections", async () => {
  const { controller, commands, request, preview, reply } = queuedReviewFixture()
  controller.review(request)
  controller.review({ ...request, useDoubleResolutionAssets: true })
  reply({ kind: "failure", requestId: 0, message: "Image processing worker stopped" })
  expect(controller.state.phase).toBe("error")
  expect(() => controller.review(request)).toThrow("ready")
  reply({ kind: "preview", requestId: 1, preview })
  expect(controller.state.phase).toBe("error")
  expect(commands).toHaveLength(1)
  await controller.reset()
  reply({ kind: "ready", requestId: 0 })
  controller.review(request)
  expect(commands.at(-1)).toEqual({ kind: "inspect", requestId: 4, request })
  reply({ kind: "preview", requestId: 4, preview })
  controller.convert()
  expect(controller.state.phase).toBe("converting")
})

test("folder discovery stays busy until the worker returns its catalog", async () => {
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
  expect(typeof controller.discover).toBe("function")
  const source = { kind: "file-list" as const, files: [] }
  const pending = controller.discover(source)
  expect(controller.state.phase).toBe("selecting")
  expect(commands.at(-1)).toEqual({ kind: "discover", requestId: 1, source })
  expect(() =>
    controller.review({
      direction: "osu-to-etterna",
      source,
      skinName: "x",
      useDoubleResolutionAssets: false,
    }),
  ).toThrow("ready")
  const discovery = {
    skins: [{ name: "Foo", path: "NoteSkins/dance/Foo" }],
    profileIds: ["00000000"],
    theme: "Rebirth",
    diagnostics: [],
  }
  listener?.({ kind: "discovery", requestId: 1, discovery })
  expect(await pending).toEqual(discovery)
})

test("reset cancels discovery and stale catalogs cannot restore the selected folder", async () => {
  const listeners: ((reply: WorkerReply) => void)[] = []
  const controller = createConversionController(() => ({
    postMessage() {},
    subscribe(callback) {
      listeners.push(callback)
      return () => {}
    },
    async dispose() {},
  }))
  controller.initialize()
  listeners[0]?.({ kind: "ready", requestId: 0 })
  expect(typeof controller.discover).toBe("function")
  const pending = controller.discover({ kind: "file-list", files: [] })
  const cancelled = pending.catch((error: unknown) => error)
  await controller.reset()
  expect(await cancelled).toBeInstanceOf(Error)
  expect(String(await cancelled)).toContain("cancelled")
  listeners[0]?.({
    kind: "discovery",
    requestId: 1,
    discovery: { skins: [], profileIds: [], theme: "Rebirth", diagnostics: [] },
  })
  expect(controller.state.phase).toBe("initializing")
  listeners[1]?.({ kind: "ready", requestId: 0 })
  expect(controller.state.phase).toBe("idle")
})

test("worker discovery failures settle the selection and allow a retry", async () => {
  let listener: ((reply: WorkerReply) => void) | undefined
  const controller = createConversionController(() => ({
    postMessage() {},
    subscribe(callback) {
      listener = callback
      return () => {}
    },
    async dispose() {},
  }))
  controller.initialize()
  listener?.({ kind: "ready", requestId: 0 })
  expect(typeof controller.discover).toBe("function")
  const pending = controller.discover({ kind: "file-list", files: [] })
  const failure = pending.catch((error: unknown) => error)
  listener?.({ kind: "failure", requestId: 1, message: "No dance NoteSkins" })
  expect(String(await failure)).toContain("No dance NoteSkins")
  expect(controller.state.phase).toBe("error")
  const retry = controller.discover({ kind: "file-list", files: [] })
  const cancelled = retry.catch((error: unknown) => error)
  await controller.dispose()
  expect(String(await cancelled)).toContain("cancelled")
})

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
      artwork: [],
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
