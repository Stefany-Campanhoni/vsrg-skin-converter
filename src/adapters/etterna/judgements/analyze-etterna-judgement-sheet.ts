import sharp from "sharp"
import type { JudgementSet } from "../../../domain/judgement.ts"
import { analyzeEtternaJudgementSheetUsing } from "./etterna-judgement-sheet-policy.ts"
export function analyzeEtternaJudgementSheet(filePath: string): Promise<JudgementSet> {
  return analyzeEtternaJudgementSheetUsing(filePath, async (path) => sharp(path).metadata())
}
