import { readTextFile } from "../../../../infrastructure/filesystem/bun-file.ts"
import type { NoteSkinContext } from "../shared-note-skin-context.ts"
import {
  analyzeEtternaReceptorsUsing,
  type EtternaReceptorAnalysis,
} from "./shared-analyze-receptors.ts"

export type { EtternaReceptorAnalysis } from "./shared-analyze-receptors.ts"
export function analyzeEtternaReceptors(
  context: NoteSkinContext,
): Promise<EtternaReceptorAnalysis> {
  return analyzeEtternaReceptorsUsing(context, readTextFile)
}
