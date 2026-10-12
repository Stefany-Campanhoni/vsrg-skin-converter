import type { ReadableDirectoryHandle } from "../application/ports/source-files.ts"
import type { Diagnostic } from "../domain/diagnostics.ts"
import type { VisualPlayfieldConfiguration } from "../domain/visual-skin.ts"

export type BrowserSource =
  | { kind: "directory-handle"; handle: ReadableDirectoryHandle }
  | { kind: "file-list"; files: readonly File[]; relativePaths?: readonly string[] }
export type WebConversionRequest =
  | {
      direction: "etterna-to-osu"
      source: BrowserSource
      skinPath: string
      profileId?: string
      theme: string
      useDefaultSettings: boolean
    }
  | {
      direction: "osu-to-etterna"
      source: BrowserSource
      skinName: string
      useDoubleResolutionAssets: boolean
    }
export interface ConversionProgress {
  phase: "reading" | "converting" | "rendering" | "archiving"
  completed: number
  total: number
}
export interface ConversionPreview {
  playfield: VisualPlayfieldConfiguration
  diagnostics: readonly Diagnostic[]
  convertedManiaSpeed?: number
}
export interface WebConversionResult {
  archive: Uint8Array
  filename: string
  diagnostics: readonly Diagnostic[]
  convertedManiaSpeed?: number
}
export type WorkerCommand =
  | { kind: "convert" | "inspect"; requestId: number; request: WebConversionRequest }
  | { kind: "dispose"; requestId: number }
export type WorkerReply =
  | { kind: "ready"; requestId: number }
  | { kind: "progress"; requestId: number; progress: ConversionProgress }
  | { kind: "preview"; requestId: number; preview: ConversionPreview }
  | { kind: "success"; requestId: number; result: WebConversionResult }
  | { kind: "failure"; requestId: number; message: string }
  | { kind: "disposed"; requestId: number }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
function diagnostics(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  const entries: readonly unknown[] = value
  return entries.every(
    (entry) =>
      record(entry) &&
      typeof entry.code === "string" &&
      typeof entry.component === "string" &&
      typeof entry.message === "string" &&
      (entry.severity === "warning" || entry.severity === "info"),
  )
}
function optionalSpeed(value: Record<string, unknown>): boolean {
  return (
    value.convertedManiaSpeed === undefined ||
    (typeof value.convertedManiaSpeed === "number" && Number.isFinite(value.convertedManiaSpeed))
  )
}
export function isWorkerReply(value: unknown): value is WorkerReply {
  if (!record(value) || !Number.isSafeInteger(value.requestId)) return false
  switch (value.kind) {
    case "ready":
    case "disposed":
      return true
    case "failure":
      return typeof value.message === "string"
    case "progress": {
      const p = value.progress
      return (
        record(p) &&
        ["reading", "converting", "rendering", "archiving"].includes(String(p.phase)) &&
        typeof p.completed === "number" &&
        Number.isFinite(p.completed) &&
        typeof p.total === "number" &&
        p.total > 0 &&
        Number.isFinite(p.total)
      )
    }
    case "success": {
      const r = value.result
      return (
        record(r) &&
        r.archive instanceof Uint8Array &&
        typeof r.filename === "string" &&
        diagnostics(r.diagnostics) &&
        optionalSpeed(r)
      )
    }
    case "preview": {
      const p = value.preview
      if (!record(p) || !record(p.playfield) || !diagnostics(p.diagnostics) || !optionalSpeed(p))
        return false
      const playfield = p.playfield
      return (
        [
          "hitPosition",
          "judgementPosition",
          "comboPosition",
          "columnWidth",
          "comboScale",
          "judgementScale",
        ].every((key) => typeof playfield[key] === "number" && Number.isFinite(playfield[key])) &&
        (playfield.isDownscroll === undefined || typeof playfield.isDownscroll === "boolean")
      )
    }
    default:
      return false
  }
}
