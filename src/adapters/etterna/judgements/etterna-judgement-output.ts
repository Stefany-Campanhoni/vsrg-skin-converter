import path from "node:path"
import type { JudgementSet } from "../../../domain/judgement.ts"
import { assertSafeEtternaDirectorySegment } from "../settings/etterna-settings-paths.ts"

const etternaProfileGuidPattern = /^[0-9a-f]{16}$/

export function getEtternaJudgementFilename(
  skinName: string,
  profileGuid: string,
  sourceDensity: JudgementSet["sourceDensity"],
): string {
  assertSafeEtternaDirectorySegment(skinName, "judgement skin name")
  if (!etternaProfileGuidPattern.test(profileGuid)) {
    throw new Error(`Invalid Etterna profile GUID: ${JSON.stringify(profileGuid)}`)
  }

  const resolutionSuffix = sourceDensity === 2 ? " (Doubleres)" : ""
  return `${skinName} - ${profileGuid} 1x6${resolutionSuffix}.png`
}

export function getEtternaJudgementRelativePath(filename: string): string {
  assertSafeEtternaDirectorySegment(filename, "judgement filename")
  return path.posix.join("Assets", "Judgments", filename)
}
