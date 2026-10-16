import { extractEtternaProfileGuid } from "./extract-etterna-profile-guid.ts"

export { extractEtternaProfileGuid } from "./extract-etterna-profile-guid.ts"

import path from "node:path"
import { readTextFile } from "../../../infrastructure/filesystem/bun-file.ts"
import { resolveEtternaProfilePath } from "../settings/etterna-settings-paths.ts"

export async function readEtternaProfileGuid(gameRoot: string, profileId: string): Promise<string> {
  const profilePath = path.join(resolveEtternaProfilePath(gameRoot, profileId), "Etterna.xml")
  let source: string
  try {
    source = await readTextFile(profilePath)
  } catch (cause) {
    throw new Error(`Could not read Etterna profile GUID from ${profilePath}`, { cause })
  }
  return extractEtternaProfileGuid(source, profilePath)
}
