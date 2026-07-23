import { readFile } from "node:fs/promises"
import {
  type Direction,
  type ReceptorSet,
  type ResolvedReceptor,
  receptorDirections,
} from "../../receptor.ts"
import { loadNoteSkinContext, normalizeRotation, titleByDirection } from "../noteskin-context.ts"
import { analyzeReceptorLua } from "./analyze-receptor.ts"

export interface EtternaReceptorAnalysis {
  receptors: ReceptorSet
  warnings: string[]
}

export async function analyzeEtternaReceptors(
  skinDirectory: string,
): Promise<EtternaReceptorAnalysis> {
  const context = await loadNoteSkinContext(skinDirectory)
  const inlineReceptorSource = context.getFunctionSource("createReceptor")
  const receptors = {} as Record<Direction, ResolvedReceptor>
  const warnings: string[] = []

  for (const direction of receptorDirections) {
    const title = titleByDirection[direction]
    const redirectedTitle = context.buttonRedirections[direction] ?? title
    const redirectedDirection = redirectedTitle.toLowerCase() as Direction
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
        warnings.push(...analysis.warnings.map((warning) => `[${direction}] ${warning}`))
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
      warnings.push(...analysis.warnings.map((warning) => `[${direction}] ${warning}`))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to analyze receptor for direction ${direction}: ${message}`, {
        cause: error,
      })
    }
  }

  return { receptors, warnings }
}
