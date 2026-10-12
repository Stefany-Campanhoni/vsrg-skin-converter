import {
  createWasmImageBackend,
  initializeBrowserVips,
} from "../infrastructure/image/wasm-image-backend.ts"
import { loadWebTemplates } from "./template-source.ts"
import { createWebConversionRuntime } from "./web-conversion.ts"
import type { WorkerCommand, WorkerReply } from "./worker-messages.ts"

const send = (reply: WorkerReply) => {
  const buffer = reply.kind === "success" ? reply.result.archive.buffer : undefined
  self.postMessage(reply, buffer instanceof ArrayBuffer ? [buffer] : [])
}
let closing = false,
  job: Promise<void> | undefined
const initialization = initializeBrowserVips(new URL("./vips/", import.meta.url)).then((module) =>
  createWebConversionRuntime({
    backend: createWasmImageBackend(module),
    loadTemplates: loadWebTemplates,
  }),
)
initialization.then(
  () => send({ kind: "ready", requestId: 0 }),
  () =>
    send({
      kind: "failure",
      requestId: 0,
      message:
        "Could not initialize image processing. Reload the page and check its local WASM resources.",
    }),
)
self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const command = event.data
  if (command.kind === "dispose") {
    closing = true
    void (async () => {
      try {
        await job
        await (await initialization).dispose()
      } catch {
      } finally {
        send({ kind: "disposed", requestId: command.requestId })
        self.close()
      }
    })()
    return
  }
  if (closing) return
  if (job) {
    send({
      kind: "failure",
      requestId: command.requestId,
      message: "Another conversion is still running.",
    })
    return
  }
  job = (async () => {
    try {
      const runtime = await initialization
      if (command.kind === "inspect") {
        const preview = await runtime.inspect(command.request)
        if (!closing) send({ kind: "preview", requestId: command.requestId, preview })
      } else {
        const result = await runtime.run(command.request, (progress) => {
          if (!closing) send({ kind: "progress", requestId: command.requestId, progress })
        })
        if (!closing) send({ kind: "success", requestId: command.requestId, result })
      }
    } catch (error) {
      if (!closing)
        send({
          kind: "failure",
          requestId: command.requestId,
          message:
            error instanceof Error
              ? error.message
              : "Conversion failed. Check the selected folder.",
        })
    }
  })().finally(() => {
    job = undefined
  })
}
