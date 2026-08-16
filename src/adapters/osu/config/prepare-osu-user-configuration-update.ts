import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FileContentExpectation } from "../../../application/ports/file-content-expectation.ts"

export interface PreparedOsuUserConfigurationUpdate {
  readonly targetPath: string
  readonly content: string
  readonly expectation: FileContentExpectation
}

export interface OsuUserConfigurationDirectoryEntry {
  readonly name: string
  isFile(): boolean
}

export interface PrepareOsuUserConfigurationUpdateDependencies {
  readDirectory(directory: string): Promise<readonly OsuUserConfigurationDirectoryEntry[]>
  readFile(filePath: string): Promise<Buffer>
}

export interface WriteOsuUserConfigurationUpdateDependencies {
  writeFile(filePath: string, content: string, encoding: "utf8"): Promise<void>
}

const defaultPrepareDependencies: PrepareOsuUserConfigurationUpdateDependencies = {
  readDirectory: (directory) => readdir(directory, { withFileTypes: true }),
  readFile,
}
const defaultWriteDependencies: WriteOsuUserConfigurationUpdateDependencies = { writeFile }
const maniaSpeedPattern = /^([ \t]*ManiaSpeed[ \t]*=[ \t]*)([^\r\n]*)(\r?)$/gim

export async function prepareOsuUserConfigurationUpdate(
  osuRoot: string,
  windowsUsername: string | undefined,
  maniaSpeed: number,
  dependencies: PrepareOsuUserConfigurationUpdateDependencies = defaultPrepareDependencies,
): Promise<PreparedOsuUserConfigurationUpdate> {
  assertWindowsUsername(windowsUsername)
  assertManiaSpeed(maniaSpeed)

  const expectedFilename = `osu!.${windowsUsername}.cfg`
  const targetPath = await findCurrentUserConfiguration(
    osuRoot,
    expectedFilename,
    windowsUsername,
    dependencies,
  )
  const original = await readCurrentUserConfiguration(
    targetPath,
    expectedFilename,
    windowsUsername,
    dependencies,
  )
  const source = original.toString("utf8")
  const matches = [...source.matchAll(maniaSpeedPattern)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ManiaSpeed assignment in ${targetPath}`)
  }
  const content = source.replace(
    maniaSpeedPattern,
    (_line, prefix: string, _value: string, carriageReturn: string) =>
      `${prefix}${maniaSpeed}${carriageReturn}`,
  )

  return {
    targetPath,
    content,
    expectation: {
      state: "sha256",
      sha256: createHash("sha256").update(original).digest("hex"),
    },
  }
}

export async function writeOsuUserConfigurationUpdate(
  outputFile: string,
  update: PreparedOsuUserConfigurationUpdate,
  dependencies: WriteOsuUserConfigurationUpdateDependencies = defaultWriteDependencies,
): Promise<void> {
  try {
    await dependencies.writeFile(outputFile, update.content, "utf8")
  } catch (cause) {
    throw new Error(`Could not write osu! user configuration ${outputFile}`, { cause })
  }
}

async function findCurrentUserConfiguration(
  osuRoot: string,
  expectedFilename: string,
  windowsUsername: string,
  dependencies: PrepareOsuUserConfigurationUpdateDependencies,
): Promise<string> {
  let entries: readonly OsuUserConfigurationDirectoryEntry[]
  try {
    entries = await dependencies.readDirectory(osuRoot)
  } catch (cause) {
    if (isEnoent(cause)) {
      throw missingCurrentUserConfiguration(osuRoot, expectedFilename, windowsUsername)
    }
    throw new Error(`Could not list osu! user configuration directory ${osuRoot}`, { cause })
  }

  const matches = entries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase() === expectedFilename.toLowerCase(),
  )
  if (matches.length === 0) {
    throw missingCurrentUserConfiguration(osuRoot, expectedFilename, windowsUsername)
  }
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one osu! user configuration named ${expectedFilename} in ${osuRoot}`,
    )
  }
  const [match] = matches
  if (!match) {
    throw new Error(
      `Could not select osu! user configuration named ${expectedFilename} in ${osuRoot}`,
    )
  }
  return path.join(osuRoot, match.name)
}

async function readCurrentUserConfiguration(
  targetPath: string,
  expectedFilename: string,
  windowsUsername: string,
  dependencies: PrepareOsuUserConfigurationUpdateDependencies,
): Promise<Buffer> {
  try {
    return await dependencies.readFile(targetPath)
  } catch (cause) {
    if (isEnoent(cause)) {
      throw missingCurrentUserConfiguration(
        path.dirname(targetPath),
        expectedFilename,
        windowsUsername,
      )
    }
    throw new Error(`Could not read osu! user configuration ${targetPath}`, { cause })
  }
}

function assertWindowsUsername(
  windowsUsername: string | undefined,
): asserts windowsUsername is string {
  if (!windowsUsername?.trim() || /[\r\n\u2028\u2029]/.test(windowsUsername)) {
    throw new Error(
      "Could not determine the current Windows username for osu! configuration update",
    )
  }
}

function assertManiaSpeed(maniaSpeed: number): void {
  if (!Number.isInteger(maniaSpeed) || maniaSpeed <= 0) {
    throw new Error("Expected a positive integer ManiaSpeed for osu! configuration update")
  }
}

function missingCurrentUserConfiguration(
  osuRoot: string,
  expectedFilename: string,
  windowsUsername: string,
): Error {
  return new Error(
    `Could not find osu! configuration ${expectedFilename} for current Windows user ${windowsUsername} in ${osuRoot}; start osu! at least once and try again`,
  )
}

function isEnoent(cause: unknown): boolean {
  return (cause as NodeJS.ErrnoException).code === "ENOENT"
}
