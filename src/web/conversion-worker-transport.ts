import type { WorkerCommand, WorkerReply } from "./worker-messages.ts"
import { isWorkerReply } from "./worker-messages.ts"
export interface ConversionWorkerTransport {
  postMessage(command: WorkerCommand): void
  subscribe(listener: (reply: WorkerReply) => void): () => void
  dispose(): Promise<void>
}
export function createConversionWorkerTransport(worker: Worker): ConversionWorkerTransport {
  const listeners = new Set<(reply: WorkerReply) => void>()
  let closing = false,
    pending: Promise<void> | undefined
  const message = (event: MessageEvent<unknown>) => {
    const data = event.data
    if (!isWorkerReply(data)) {
      failure()
      return
    }
    for (const listener of listeners) listener(data)
  }
  const failure = () => {
    for (const listener of listeners)
      listener({
        kind: "failure",
        requestId: 0,
        message: "Image processing worker stopped. Reset the selection and try again.",
      })
  }
  worker.addEventListener("message", message)
  worker.addEventListener("error", failure)
  worker.addEventListener("messageerror", failure)
  return {
    postMessage(command) {
      if (closing) throw new Error("Worker is closing")
      if (command.kind === "dispose") {
        worker.postMessage(command)
        return
      }
      const original = command.kind === "discover" ? command.source : command.request.source
      const source =
        original.kind === "file-list"
          ? {
              ...original,
              relativePaths:
                original.relativePaths ?? original.files.map((file) => file.webkitRelativePath),
            }
          : original
      worker.postMessage(
        command.kind === "discover"
          ? { ...command, source }
          : {
              ...command,
              request: { ...command.request, source },
            },
      )
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      if (pending) return pending
      closing = true
      pending = new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer)
          worker.removeEventListener("message", message)
          worker.removeEventListener("error", failure)
          worker.removeEventListener("messageerror", failure)
          listeners.clear()
          worker.terminate()
          error ? reject(error) : resolve()
        }
        const timer = setTimeout(
          () =>
            finish(
              new Error("Image processing did not acknowledge cleanup; worker was terminated."),
            ),
          30000,
        )
        listeners.add((reply) => {
          if (reply.kind === "disposed" && reply.requestId === -1) finish()
        })
        worker.postMessage({ kind: "dispose", requestId: -1 } satisfies WorkerCommand)
      })
      return pending
    },
  }
}
