import type { Diagnostic } from "../../../domain/diagnostics.ts"
import type { JudgementSet } from "../../../domain/judgement.ts"
import { readEtternaJudgementSelection } from "../assets/read-etterna-judgement-selection.ts"
import { readEtternaProfileGuid } from "../profile/read-etterna-profile-guid.ts"
import { analyzeEtternaJudgementSheet } from "./analyze-etterna-judgement-sheet.ts"

export interface EtternaJudgementAnalysis {
  judgements: JudgementSet
  diagnostics: Diagnostic[]
}

export async function readEtternaJudgements(gameRoot: string): Promise<EtternaJudgementAnalysis> {
  const guid = await readEtternaProfileGuid(gameRoot)
  const selection = await readEtternaJudgementSelection(gameRoot, guid)
  return {
    judgements: await analyzeEtternaJudgementSheet(selection.filePath),
    diagnostics: selection.diagnostics,
  }
}
