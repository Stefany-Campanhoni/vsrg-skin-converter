import { readFile } from "node:fs/promises"
import path from "node:path"

const supportedProfileId = "00000000"

export async function readEtternaProfileGuid(gameRoot: string): Promise<string> {
  const profilePath = path.join(
    gameRoot,
    "Save",
    "LocalProfiles",
    supportedProfileId,
    "Etterna.xml",
  )
  const source = await readFile(profilePath, "utf8")
  return extractEtternaProfileGuid(source, profilePath)
}

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
