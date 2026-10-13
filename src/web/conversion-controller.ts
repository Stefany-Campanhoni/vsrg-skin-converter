import type { EtternaSourceDiscovery } from "../adapters/etterna/catalog/discover-etterna-source.ts"
import type { ConversionWorkerTransport } from "./conversion-worker-transport.ts"
import type {
  BrowserSource,
  ConversionPreview,
  ConversionProgress,
  WebConversionRequest,
  WebConversionResult,
} from "./worker-messages.ts"
export interface ConversionState {
  phase: "initializing" | "idle" | "selecting" | "review" | "converting" | "success" | "error"
  request?: WebConversionRequest
  preview?: ConversionPreview
  progress?: ConversionProgress
  result?: WebConversionResult
  message?: string
}
export function createConversionController(factory: () => ConversionWorkerTransport) {
  let state: ConversionState = { phase: "initializing" },
    transport: ConversionWorkerTransport | undefined,
    unsubscribe: (() => void) | undefined,
    id = 0,
    generation = 0
  const listeners = new Set<(state: ConversionState) => void>()
  let resetting: Promise<void> | undefined
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
  function initialize() {
    const epoch = ++generation
    transport = factory()
    unsubscribe = transport.subscribe((reply) => {
      if (epoch !== generation) return
      if (reply.kind === "ready") {
        update({ phase: "idle" })
        return
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
        state.phase === "initializing" ||
        state.phase === "converting" ||
        state.phase === "selecting"
      )
        throw new Error("Processor is not ready")
      update({ phase: "review", request })
      transport.postMessage({ kind: "inspect", requestId: ++id, request })
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
      cancelDiscovery()
      ++generation
      unsubscribe?.()
      await resetting
      await transport?.dispose()
      transport = undefined
    },
  }
}
