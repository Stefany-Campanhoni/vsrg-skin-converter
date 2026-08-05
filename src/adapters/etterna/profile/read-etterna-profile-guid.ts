import { readFile } from "node:fs/promises"
import path from "node:path"
import { resolveEtternaProfilePath } from "../settings/etterna-settings-paths.ts"

export async function readEtternaProfileGuid(gameRoot: string, profileId: string): Promise<string> {
  const profilePath = path.join(resolveEtternaProfilePath(gameRoot, profileId), "Etterna.xml")
  let source: string
  try {
    source = await readFile(profilePath, "utf8")
  } catch (cause) {
    throw new Error(`Could not read Etterna profile GUID from ${profilePath}`, { cause })
  }
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
