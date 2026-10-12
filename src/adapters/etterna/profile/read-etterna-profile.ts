import { extractEtternaPlayfieldConfiguration } from "./extract-etterna-profile.ts"

export { extractEtternaPlayfieldConfiguration } from "./extract-etterna-profile.ts"

import { readdir } from "node:fs/promises"
import path from "node:path"
import luaparse from "luaparse"
import type { PlayfieldConfiguration } from "../../../domain/skin.ts"
import { readTextFile } from "../../../infrastructure/filesystem/bun-file.ts"
import { resolveEtternaProfileSettingsPath } from "../settings/etterna-settings-paths.ts"

export async function readEtternaProfile(
  gameRoot: string,
  profileId: string,
  theme: string,
): Promise<Omit<PlayfieldConfiguration, "scrollSpeed" | "isDownscroll">> {
  const profileDirectory = resolveEtternaProfileSettingsPath(gameRoot, profileId, theme)
  const entries = await readProfileEntries(profileDirectory)
  const profilePath = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase() === "playerconfig.lua")
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((left, right) => left.localeCompare(right))
    .at(0)
  if (!profilePath) {
    throw new Error(`Etterna playerConfig.lua was not found in ${profileDirectory}`)
  }
  const source = await readProfileSource(profilePath)
  try {
    return extractEtternaPlayfieldConfiguration(luaparse.parse(source))
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : ""
    throw new Error(`Could not interpret Etterna profile ${profilePath}${detail}`, { cause })
  }
}

async function readProfileEntries(profileDirectory: string) {
  try {
    return await readdir(profileDirectory, {
      recursive: true,
      withFileTypes: true,
    })
  } catch (cause) {
    throw new Error(`Could not inspect Etterna profile settings ${profileDirectory}`, { cause })
  }
}

async function readProfileSource(profilePath: string): Promise<string> {
  try {
    return await readTextFile(profilePath)
  } catch (cause) {
    throw new Error(`Could not read Etterna profile configuration ${profilePath}`, { cause })
  }
}
