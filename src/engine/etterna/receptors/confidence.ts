import type { ReceptorCandidate, ReceptorImage, ReceptorState } from "../../receptor.ts"

export interface CandidateSelection {
  image: ReceptorImage
  warning?: string
}

export function selectCandidate(
  state: ReceptorState,
  candidates: ReceptorCandidate[],
  sourceFile: string,
): CandidateSelection {
  const uniqueCandidates = deduplicateCandidates(candidates).sort(
    (left, right) =>
      right.score - left.score ||
      left.filePath.localeCompare(right.filePath) ||
      (left.frame?.index ?? 0) - (right.frame?.index ?? 0),
  )
  const selected = uniqueCandidates[0]

  if (!selected) {
    throw new Error(`Could not identify the ${state} receptor in ${sourceFile}`)
  }

  const image: ReceptorImage = {
    filePath: selected.filePath,
    rotation: selected.rotation,
    ...(selected.frame ? { frame: selected.frame } : {}),
  }

  if (uniqueCandidates.length === 1) {
    return { image }
  }

  const alternatives = uniqueCandidates
    .slice(1)
    .map((candidate) => `${candidate.filePath} (score ${candidate.score})`)
    .join(", ")

  return {
    image,
    warning: `Selected ${state} receptor ${selected.filePath} (score ${selected.score}); alternatives: ${alternatives}`,
  }
}

function deduplicateCandidates(candidates: ReceptorCandidate[]): ReceptorCandidate[] {
  const byIdentity = new Map<string, ReceptorCandidate>()

  for (const candidate of candidates) {
    const key = [
      candidate.state,
      candidate.filePath.toLowerCase(),
      candidate.frame?.index ?? "",
      candidate.rotation,
    ].join("|")
    const current = byIdentity.get(key)

    if (!current || candidate.score > current.score) {
      byIdentity.set(key, candidate)
    }
  }

  return [...byIdentity.values()]
}
