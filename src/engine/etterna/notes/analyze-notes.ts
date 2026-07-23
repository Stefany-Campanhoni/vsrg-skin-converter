import { readFile } from "node:fs/promises"
import type { NoteImage, NoteSet } from "../../note.ts"
import { type Direction, receptorDirections } from "../../receptor.ts"
import { loadNoteSkinContext, normalizeRotation, titleByDirection } from "../noteskin-context.ts"
import type { ResolvedSkinAsset } from "../receptors/resolve-files.ts"
import { analyzeTapNoteLua } from "./analyze-tap-note.ts"

export interface EtternaNoteAnalysis {
  notes: NoteSet
  warnings: string[]
}

interface PreliminaryNote {
  asset: ResolvedSkinAsset
  rotation: number
}

export async function analyzeEtternaNotes(skinDirectory: string): Promise<EtternaNoteAnalysis> {
  const context = await loadNoteSkinContext(skinDirectory)
  const inlineNoteSource = context.getFunctionSource("createNote")
  const genericLoadSource = context.getFunctionSource("Load")
  const preliminary = {} as Record<Direction, PreliminaryNote>
  const warnings = new Set<string>()
  const shouldRotate = context.partsToRotate["Tap Note"] === true

  for (const direction of receptorDirections) {
    const title = titleByDirection[direction]
    const redirectedTitle = context.buttonRedirections[direction] ?? title
    const redirectedDirection = redirectedTitle.toLowerCase() as Direction
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
        for (const warning of analysis.warnings) {
          warnings.add(`[${direction}] ${warning}`)
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
          for (const warning of analysis.warnings) {
            warnings.add(`[${direction}] ${warning}`)
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
      for (const warning of analysis.warnings) {
        warnings.add(`[${direction}] ${warning}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to analyze tap note for direction ${direction}: ${message}`, {
        cause: error,
      })
    }
  }

  const sharedVerticalSheet = isOneSharedVerticalSheet(preliminary)
  const notes = {} as Record<Direction, NoteImage>
  for (const direction of receptorDirections) {
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

  return { notes, warnings: [...warnings] }
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

function isOneSharedVerticalSheet(notes: Record<Direction, PreliminaryNote>): boolean {
  const assets = receptorDirections.map((direction) => notes[direction].asset)
  return (
    new Set(assets.map((asset) => asset.filePath.toLowerCase())).size === 1 &&
    assets[0]?.columns === 1 &&
    (assets[0]?.rows ?? 0) >= 2
  )
}
