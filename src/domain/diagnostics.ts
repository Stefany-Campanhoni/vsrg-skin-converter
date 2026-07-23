import type { ColumnDirection } from "./image.ts"

export const diagnosticSeverities = ["info", "warning"] as const

export type DiagnosticSeverity = (typeof diagnosticSeverities)[number]

export interface Diagnostic {
  code: string
  severity: DiagnosticSeverity
  component: string
  direction?: ColumnDirection
  message: string
}
