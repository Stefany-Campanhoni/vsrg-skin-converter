import { readFile } from "node:fs/promises"
import type { Diagnostic } from "../../../../domain/diagnostics.ts"
import {
  type ColumnDirection,
  columnDirections,
  type TapNoteSet,
} from "../../../../domain/image.ts"
import { type NoteSkinContext, normalizeRotation, titleByDirection } from "../note-skin-context.ts"
import type { ResolvedSkinAsset } from "../resolve-skin-files.ts"
import { analyzeTapNoteLua } from "./analyze-tap-note.ts"

export interface EtternaNoteAnalysis {
  notes: TapNoteSet
  diagnostics: Diagnostic[]
}

interface PreliminaryNote {
  asset: ResolvedSkinAsset
  rotation: number
}

export async function analyzeEtternaNotes(context: NoteSkinContext): Promise<EtternaNoteAnalysis> {
  const inlineNoteSource = context.getFunctionSource("createNote")
  const genericLoadSource = context.getFunctionSource("Load")
  const preliminary = {} as Record<ColumnDirection, PreliminaryNote>
  const diagnostics = new Map<string, Diagnostic>()
  const shouldRotate = context.partsToRotate["Tap Note"] === true

  for (const direction of columnDirections) {
    const title = titleByDirection[direction]
    const redirectedTitle = context.buttonRedirections[direction] ?? title
    const redirectedDirection = redirectedTitle.toLowerCase() as ColumnDirection
    const rotation = shouldRotate ? normalizeRotation(context.rotations[direction] ?? 0) : 0
    let inlineError: unknown

    if (inlineNoteSource) {
      try {
        const analysis = analyzeTapNoteLua({
          source: inlineNoteSource,
          filePath: context.filePath,
          variables: createVariables(title, redirectedTitle),
          resolver: context.resolver,
        })
        preliminary[direction] = { asset: analysis.asset, rotation }
        for (const message of analysis.warnings) {
          addDiagnostic(diagnostics, direction, message)
        }
        continue
      } catch (error) {
        inlineError = error
      }
    }

    const tapNoteLuaPath = await context.resolver.resolveElementLua(redirectedDirection, "Tap Note")
    if (!tapNoteLuaPath) {
      if (genericLoadSource) {
        try {
          const analysis = analyzeTapNoteLua({
            source: genericLoadSource,
            filePath: context.filePath,
            variables: createVariables(title, redirectedTitle),
            resolver: context.resolver,
          })
          preliminary[direction] = { asset: analysis.asset, rotation }
          for (const message of analysis.warnings) {
            addDiagnostic(diagnostics, direction, message)
          }
          continue
        } catch (error) {
          inlineError = error
        }
      }

      const inlineDiagnostic =
        inlineError instanceof Error ? ` Inline analysis: ${inlineError.message}` : ""
      throw new Error(
        `Could not resolve a tap-note Lua file for direction ${direction}.${inlineDiagnostic}`,
      )
    }

    try {
      const analysis = analyzeTapNoteLua({
        source: await readFile(tapNoteLuaPath, "utf8"),
        filePath: tapNoteLuaPath,
        variables: createVariables(redirectedTitle, redirectedTitle),
        resolver: context.resolver,
      })
      preliminary[direction] = { asset: analysis.asset, rotation }
      for (const message of analysis.warnings) {
        addDiagnostic(diagnostics, direction, message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to analyze tap note for direction ${direction}: ${message}`, {
        cause: error,
      })
    }
  }

  const sharedVerticalSheet = isOneSharedVerticalSheet(preliminary)
  const notes = {} as TapNoteSet
  for (const direction of columnDirections) {
    const { asset, rotation } = preliminary[direction]
    const frameCount = asset.columns * asset.rows
    const frameIndex = sharedVerticalSheet && (direction === "down" || direction === "up") ? 1 : 0
    notes[direction] = {
      filePath: asset.filePath,
      rotation,
      ...(frameCount > 1
        ? {
            frame: {
              index: frameIndex,
              columns: asset.columns,
              rows: asset.rows,
            },
          }
        : {}),
    }
  }

  return { notes, diagnostics: [...diagnostics.values()] }
}

function createVariables(directionTitle: string, redirectedTitle: string): Record<string, string> {
  return {
    direction: directionTitle,
    Button: redirectedTitle,
    sButton: directionTitle,
    Element: "Tap Note",
    sElement: "Tap Note",
  }
}

function isOneSharedVerticalSheet(notes: Record<ColumnDirection, PreliminaryNote>): boolean {
  const assets = columnDirections.map((direction) => notes[direction].asset)
  return (
    new Set(assets.map((asset) => asset.filePath.toLowerCase())).size === 1 &&
    assets[0]?.columns === 1 &&
    (assets[0]?.rows ?? 0) >= 2
  )
}

function addDiagnostic(
  diagnostics: Map<string, Diagnostic>,
  direction: ColumnDirection,
  message: string,
): void {
  const diagnostic: Diagnostic = {
    code: "etterna.note.ambiguous-texture",
    severity: "warning",
    component: "etterna-note-analysis",
    direction,
    message,
  }
  diagnostics.set(`${direction}:${message}`, diagnostic)
}
