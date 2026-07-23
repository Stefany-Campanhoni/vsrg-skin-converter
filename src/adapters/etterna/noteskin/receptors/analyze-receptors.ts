import { readFile } from "node:fs/promises"
import type { Diagnostic } from "../../../../domain/diagnostics.ts"
import {
  type ColumnDirection,
  columnDirections,
  type ReceptorSet,
} from "../../../../domain/image.ts"
import { type NoteSkinContext, normalizeRotation, titleByDirection } from "../note-skin-context.ts"
import { analyzeReceptorLua } from "./analyze-receptor.ts"

export interface EtternaReceptorAnalysis {
  receptors: ReceptorSet
  diagnostics: Diagnostic[]
}

export async function analyzeEtternaReceptors(
  context: NoteSkinContext,
): Promise<EtternaReceptorAnalysis> {
  const inlineReceptorSource = context.getFunctionSource("createReceptor")
  const receptors = {} as ReceptorSet
  const diagnostics: Diagnostic[] = []

  for (const direction of columnDirections) {
    const title = titleByDirection[direction]
    const redirectedTitle = context.buttonRedirections[direction] ?? title
    const redirectedDirection = redirectedTitle.toLowerCase() as ColumnDirection
    const rotation = normalizeRotation(context.rotations[direction] ?? 0)
    let inlineError: unknown

    if (inlineReceptorSource) {
      try {
        const analysis = analyzeReceptorLua({
          source: inlineReceptorSource,
          filePath: context.filePath,
          direction,
          variables: {
            direction: title,
            Button: redirectedTitle,
            sButton: title,
            Element: "Receptor",
            sElement: "Receptor",
          },
          resolver: context.resolver,
          rotation,
        })
        receptors[direction] = analysis.receptor
        diagnostics.push(
          ...analysis.warnings.map((message) => createDiagnostic(direction, message)),
        )
        continue
      } catch (error) {
        inlineError = error
      }
    }

    const receptorLuaPath = await context.resolver.resolveReceptorLua(redirectedDirection)
    if (!receptorLuaPath) {
      const inlineDiagnostic =
        inlineError instanceof Error ? ` Inline analysis: ${inlineError.message}` : ""
      throw new Error(
        `Could not resolve a receptor Lua file for direction ${direction}.${inlineDiagnostic}`,
      )
    }

    try {
      const analysis = analyzeReceptorLua({
        source: await readFile(receptorLuaPath, "utf8"),
        filePath: receptorLuaPath,
        direction,
        variables: {
          direction: redirectedTitle,
          Button: redirectedTitle,
          sButton: title,
          Element: "Receptor",
          sElement: "Receptor",
        },
        resolver: context.resolver,
        rotation,
      })
      receptors[direction] = analysis.receptor
      diagnostics.push(...analysis.warnings.map((message) => createDiagnostic(direction, message)))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to analyze receptor for direction ${direction}: ${message}`, {
        cause: error,
      })
    }
  }

  return { receptors, diagnostics }
}

function createDiagnostic(direction: ColumnDirection, message: string): Diagnostic {
  return {
    code: "etterna.receptor.ambiguous-texture",
    severity: "warning",
    component: "etterna-receptor-analysis",
    direction,
    message,
  }
}
