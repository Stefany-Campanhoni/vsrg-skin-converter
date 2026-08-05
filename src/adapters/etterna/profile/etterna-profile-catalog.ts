import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  resolveEtternaProfilePath,
  resolveEtternaProfilesPath,
} from "../settings/etterna-settings-paths.ts"

const unknownDisplayName = "unknown"

type ProfileSourceReader = (filePath: string) => Promise<string>

export interface EtternaProfile {
  readonly id: string
  readonly displayName: string
}

export interface ListEtternaProfilesOptions {
  readProfileSource?: ProfileSourceReader
}

export async function listEtternaProfiles(
  gameRoot: string,
  options: ListEtternaProfilesOptions = {},
): Promise<EtternaProfile[]> {
  const profilesDirectory = resolveEtternaProfilesPath(gameRoot)
  const readProfileSource = options.readProfileSource ?? ((filePath) => readFile(filePath, "utf8"))
  const entries = await readProfileDirectory(profilesDirectory)
  const profileEntries = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
  if (profileEntries.length === 0) {
    throw new Error(`No Etterna profiles found in ${profilesDirectory}`)
  }
  return settleAll(
    profileEntries.map((entry) =>
      invokeAsPromise(async () => {
        const profilePath = path.join(
          resolveEtternaProfilePath(gameRoot, entry.name),
          "Etterna.xml",
        )
        try {
          return {
            id: entry.name,
            displayName: extractEtternaProfileDisplayName(await readProfileSource(profilePath)),
          }
        } catch (cause) {
          throw new Error(`Could not read Etterna profile ${entry.name} from ${profilePath}`, {
            cause,
          })
        }
      }),
    ),
  )
}

async function readProfileDirectory(profilesDirectory: string) {
  try {
    return await readdir(profilesDirectory, { withFileTypes: true })
  } catch (cause) {
    throw new Error(`Could not list Etterna profiles in ${profilesDirectory}`, { cause })
  }
}

export function extractEtternaProfileDisplayName(source: string): string {
  const displayName = /<DisplayName\b[^>]*>([\s\S]*?)<\/DisplayName>/i.exec(source)?.[1]?.trim()
  return displayName || unknownDisplayName
}
