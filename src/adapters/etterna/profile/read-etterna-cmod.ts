import { readFile } from "node:fs/promises"
import path from "node:path"
import { resolveEtternaProfilePath } from "../settings/etterna-settings-paths.ts"

export async function readEtternaCmod(gameRoot: string, profileId: string): Promise<number> {
  const profilePath = path.join(resolveEtternaProfilePath(gameRoot, profileId), "Etterna.xml")
  let source: string
  try {
    source = await readFile(profilePath, "utf8")
  } catch (cause) {
    throw new Error(`Could not read Etterna CMod from ${profilePath}`, { cause })
  }
  return extractEtternaCmod(source, profilePath)
}

export function extractEtternaCmod(source: string, profilePath: string): number {
  const modifierSections = [
    ...source.matchAll(/<DefaultModifiers\b[^>]*>([\s\S]*?)<\/DefaultModifiers>/gi),
  ]
  if (modifierSections.length !== 1) {
    throw new Error(`Expected exactly one <DefaultModifiers> in ${profilePath}`)
  }
  const modifierSource = modifierSections[0]?.[1] ?? ""
  const danceMatches = [...modifierSource.matchAll(/<dance\b[^>]*>([\s\S]*?)<\/dance>/gi)]
  if (danceMatches.length !== 1) {
    throw new Error(`Expected exactly one <dance> in <DefaultModifiers> in ${profilePath}`)
  }
  const cmods = (danceMatches[0]?.[1] ?? "")
    .split(",")
    .map((modifier) => modifier.trim())
    .filter((modifier) => /^C\d+$/i.test(modifier))
  if (cmods.length !== 1) {
    throw new Error(`Expected exactly one CMod in ${profilePath}`)
  }
  const cmod = Number(cmods[0]?.slice(1))
  if (!Number.isInteger(cmod) || cmod <= 0) {
    throw new Error(`Expected a positive integer CMod in ${profilePath}`)
  }
  return cmod
}
