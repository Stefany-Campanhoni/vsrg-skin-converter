import { readTextFile } from "../../../../infrastructure/filesystem/bun-file.ts"
import type { NoteSkinContext } from "../shared-note-skin-context.ts"
import { analyzeEtternaNotesUsing, type EtternaNoteAnalysis } from "./shared-analyze-notes.ts"

export type { EtternaNoteAnalysis } from "./shared-analyze-notes.ts"
export function analyzeEtternaNotes(context: NoteSkinContext): Promise<EtternaNoteAnalysis> {
  return analyzeEtternaNotesUsing(context, readTextFile)
}
