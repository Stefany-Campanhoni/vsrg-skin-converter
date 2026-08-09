import { randomBytes as defaultRandomBytes } from "node:crypto"
import type { Dirent } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  resolveEtternaProfilePath,
  resolveEtternaProfilesPath,
} from "../settings/etterna-settings-paths.ts"
import { readEtternaProfileGuid } from "./read-etterna-profile-guid.ts"

const profileIdPattern = /^\d{8}$/
const maximumProfileId = 99_999_999
const guidByteLength = 8
const defaultMaxGuidAttempts = 32

export interface EtternaProfileIdentity {
  readonly id: string
  readonly guid: string
}

export interface AllocateEtternaProfileIdentityOptions {
  readonly randomBytes?: (size: number) => Buffer
  readonly maxGuidAttempts?: number
}

export async function allocateEtternaProfileIdentity(
  gameRoot: string,
  options: AllocateEtternaProfileIdentityOptions = {},
): Promise<EtternaProfileIdentity> {
  const profileIds = await listValidProfileIds(gameRoot)
  const id = allocateProfileId(profileIds)
  const existingGuids = new Set(
    (await readExistingGuids(gameRoot, profileIds)).map((guid) => guid.toLowerCase()),
  )

  return {
    id,
    guid: allocateGuid(existingGuids, options),
  }
}

async function listValidProfileIds(gameRoot: string): Promise<string[]> {
  const profilesDirectory = resolveEtternaProfilesPath(gameRoot)
  let entries: Dirent[]
  try {
    entries = await readdir(profilesDirectory, { withFileTypes: true })
  } catch (cause) {
    if (isNotFoundError(cause)) {
      return []
    }
    throw new Error(`Could not list Etterna profiles in ${profilesDirectory}`, { cause })
  }

  return entries
    .filter((entry) => entry.isDirectory() && profileIdPattern.test(entry.name))
    .map((entry) => entry.name)
}

function allocateProfileId(profileIds: readonly string[]): string {
  const highestId = profileIds.reduce((highest, id) => Math.max(highest, Number(id)), -1)
  if (highestId === maximumProfileId) {
    throw new Error("Cannot allocate an Etterna profile ID after 99999999")
  }
  return String(highestId + 1).padStart(8, "0")
}

async function readExistingGuids(
  gameRoot: string,
  profileIds: readonly string[],
): Promise<string[]> {
  return settleAll(
    profileIds.map((profileId) =>
      invokeAsPromise(async () => {
        const profilePath = path.join(resolveEtternaProfilePath(gameRoot, profileId), "Etterna.xml")
        try {
          return await readEtternaProfileGuid(gameRoot, profileId)
        } catch (cause) {
          throw new Error(
            `Could not read GUID for Etterna profile ${profileId} from ${profilePath}`,
            { cause },
          )
        }
      }),
    ),
  )
}

function allocateGuid(
  existingGuids: ReadonlySet<string>,
  options: AllocateEtternaProfileIdentityOptions,
): string {
  const randomBytes = options.randomBytes ?? defaultRandomBytes
  const maxGuidAttempts = options.maxGuidAttempts ?? defaultMaxGuidAttempts
  if (!Number.isInteger(maxGuidAttempts) || maxGuidAttempts < 1) {
    throw new Error("Etterna GUID attempts must be a positive integer")
  }

  for (let attempt = 0; attempt < maxGuidAttempts; attempt += 1) {
    const bytes = randomBytes(guidByteLength)
    if (!Buffer.isBuffer(bytes) || bytes.length !== guidByteLength) {
      throw new Error("Etterna GUID random source must return exactly 8 bytes")
    }
    const guid = bytes.toString("hex")
    if (!existingGuids.has(guid)) {
      return guid
    }
  }

  throw new Error(`Could not allocate a unique Etterna GUID after ${maxGuidAttempts} attempts`)
}

function isNotFoundError(cause: unknown): cause is NodeJS.ErrnoException {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"
}
