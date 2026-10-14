import type { EtternaSourceDiscovery } from "../adapters/etterna/catalog/discover-etterna-source.ts"
import type { ConversionWorkerTransport } from "./conversion-worker-transport.ts"
import type {
  BrowserSource,
  ConversionPreview,
  ConversionProgress,
  WebConversionRequest,
  WebConversionResult,
  WorkerCommand,
} from "./worker-messages.ts"
export interface ConversionState {
  phase: "initializing" | "idle" | "selecting" | "review" | "converting" | "success" | "error"
  request?: WebConversionRequest
  preview?: ConversionPreview
  progress?: ConversionProgress
  result?: WebConversionResult
  message?: string
  requiresReset?: boolean
}
export function createConversionController(factory: () => ConversionWorkerTransport) {
  let state: ConversionState = { phase: "initializing" },
    transport: ConversionWorkerTransport | undefined,
    unsubscribe: (() => void) | undefined,
    id = 0,
    generation = 0,
    failed = false
  const listeners = new Set<(state: ConversionState) => void>()
  let resetting: Promise<void> | undefined
  let inspecting: number | undefined,
    queuedInspection: (WorkerCommand & { kind: "inspect" }) | undefined
  let discovery:
    | { resolve: (value: EtternaSourceDiscovery) => void; reject: (error: Error) => void }
    | undefined
  function cancelDiscovery() {
    discovery?.reject(new Error("Folder selection cancelled"))
    discovery = undefined
  }
  const update = (next: ConversionState) => {
    state = next
    for (const listener of listeners) listener(state)
  }
  function sendInspection(command: WorkerCommand & { kind: "inspect" }) {
    inspecting = command.requestId
    try {
      transport?.postMessage(command)
    } catch (cause) {
      inspecting = undefined
      update({
        phase: "error",
        message: cause instanceof Error ? cause.message : "Could not inspect the selection",
      })
    }
  }
  function initialize() {
    failed = false
    const epoch = ++generation
    transport = factory()
    unsubscribe = transport.subscribe((reply) => {
      if (epoch !== generation || failed) return
      if (reply.kind === "failure" && reply.requestId === 0) {
        failed = true
        inspecting = undefined
        queuedInspection = undefined
        discovery?.reject(new Error(reply.message))
        discovery = undefined
        update({ phase: "error", requiresReset: true, message: reply.message })
        return
      }
      if (reply.kind === "ready") {
        update({ phase: "idle" })
        return
      }
      if (
        reply.requestId === inspecting &&
        (reply.kind === "preview" || reply.kind === "failure")
      ) {
        inspecting = undefined
        if (queuedInspection) {
          const command = queuedInspection
          queuedInspection = undefined
          sendInspection(command)
          return
        }
      }
      if (reply.requestId !== id && !(reply.kind === "failure" && reply.requestId === 0)) return
      if (reply.kind === "progress") update({ ...state, progress: reply.progress })
      if (reply.kind === "preview") update({ ...state, phase: "review", preview: reply.preview })
      if (reply.kind === "success") update({ phase: "success", result: reply.result })
      if (reply.kind === "discovery" && discovery) {
        const pending = discovery
        discovery = undefined
        update({ phase: "idle" })
        pending.resolve(reply.discovery)
      }
      if (reply.kind === "failure") {
        discovery?.reject(new Error(reply.message))
        discovery = undefined
        update({ phase: "error", message: reply.message })
      }
    })
  }
  return {
    get state() {
      return state
    },
    initialize,
    discover(source: BrowserSource): Promise<EtternaSourceDiscovery> {
      if (
        !transport ||
        failed ||
        state.phase === "initializing" ||
        state.phase === "converting" ||
        state.phase === "selecting" ||
        (state.phase === "review" && !state.preview)
      )
        throw new Error("Processor is not ready")
      update({ phase: "selecting" })
      return new Promise((resolve, reject) => {
        discovery = { resolve, reject }
        try {
          transport?.postMessage({ kind: "discover", requestId: ++id, source })
        } catch (error) {
          discovery = undefined
          const failure = error instanceof Error ? error : new Error("Could not read the folder")
          update({ phase: "error", message: failure.message })
          reject(failure)
        }
      })
    },
    subscribe(listener: (state: ConversionState) => void) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    review(request: WebConversionRequest) {
      if (
        !transport ||
        failed ||
        state.phase === "initializing" ||
        state.phase === "converting" ||
        state.phase === "selecting"
      )
        throw new Error("Processor is not ready")
      update({ phase: "review", request })
      const command = { kind: "inspect" as const, requestId: ++id, request }
      if (inspecting !== undefined) queuedInspection = command
      else sendInspection(command)
    },
    convert() {
      if (state.phase !== "review" || !state.preview || !state.request)
        throw new Error("Complete the review before conversion")
      const request = state.request
      update({ phase: "converting", request })
      transport?.postMessage({ kind: "convert", requestId: ++id, request })
    },
    reset() {
      if (resetting) return resetting
      ++id
      queuedInspection = undefined
      inspecting = undefined
      cancelDiscovery()
      const epoch = ++generation
      unsubscribe?.()
      update({ phase: "initializing" })
      const prior = transport
      transport = undefined
      resetting = (async () => {
        try {
          await prior?.dispose()
          if (epoch === generation) initialize()
        } catch (error) {
          update({
            phase: "error",
            message: error instanceof Error ? error.message : "Could not release image processing",
          })
        }
      })().finally(() => {
        resetting = undefined
      })
      return resetting
    },
    async dispose() {
      ++id
      queuedInspection = undefined
      inspecting = undefined
      cancelDiscovery()
      ++generation
      unsubscribe?.()
      await resetting
      await transport?.dispose()
      transport = undefined
    },
  }
}
