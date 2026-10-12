import { extractEtternaCmod } from "./extract-etterna-cmod.ts"

export { extractEtternaCmod } from "./extract-etterna-cmod.ts"

import path from "node:path"
import { readTextFile } from "../../../infrastructure/filesystem/bun-file.ts"
import { resolveEtternaProfilePath } from "../settings/etterna-settings-paths.ts"

export async function readEtternaCmod(gameRoot: string, profileId: string): Promise<number> {
  const profilePath = path.join(resolveEtternaProfilePath(gameRoot, profileId), "Etterna.xml")
  let source: string
  try {
    source = await readTextFile(profilePath)
  } catch (cause) {
    throw new Error(`Could not read Etterna CMod from ${profilePath}`, { cause })
  }
  return extractEtternaCmod(source, profilePath)
}
