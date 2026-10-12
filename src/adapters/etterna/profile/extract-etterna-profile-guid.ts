export function extractEtternaProfileGuid(source: string, profilePath: string): string {
  const matches = [...source.matchAll(/<Guid\b[^>]*>([\s\S]*?)<\/Guid>/gi)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one <Guid> in ${profilePath}`)
  }

  const guid = matches[0]?.[1]?.trim()
  if (!guid) {
    throw new Error(`Expected a non-empty <Guid> in ${profilePath}`)
  }
  return guid
}
