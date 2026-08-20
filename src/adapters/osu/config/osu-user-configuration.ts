import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"

export interface OsuUserConfiguration {
  readonly filePath: string
  readonly username: string
  readonly width: number
  readonly height: number
  readonly maniaSpeed: number
  readonly useDoubleResolutionAssets: boolean
}

export function parseOsuUserConfiguration(source: string, filePath: string): OsuUserConfiguration {
  const properties = parseProperties(source)
  const username = readUsername(properties, filePath)
  const fullscreen = readFullscreen(properties, filePath)
  const width = readDimension(properties, fullscreen ? "widthfullscreen" : "width", filePath)
  const height = readDimension(properties, fullscreen ? "heightfullscreen" : "height", filePath)
  const maniaSpeed = readManiaSpeed(properties, filePath)

  return {
    filePath,
    username,
    width,
    height,
    maniaSpeed,
    useDoubleResolutionAssets: width > 1280 || height > 720,
  }
}

function readManiaSpeed(properties: ReadonlyMap<string, string>, filePath: string): number {
  const value = Number(requiredProperty(properties, "maniaspeed", filePath))
  if (!Number.isInteger(value) || value <= 0) {
    throw invalidProperty("ManiaSpeed", filePath)
  }
  return value
}

export async function listOsuUserConfigurations(osuRoot: string): Promise<OsuUserConfiguration[]> {
  const entries = await readOsuRoot(osuRoot)
  const configurationPaths = entries
    .filter((entry) => entry.isFile() && /^osu!\..+\.cfg$/i.test(entry.name))
    .map((entry) => path.join(osuRoot, entry.name))

  if (configurationPaths.length === 0) {
    throw new Error(`No osu! user configurations found in ${osuRoot}`)
  }

  const configurations = await settleAll(
    configurationPaths.map((filePath) =>
      invokeAsPromise(async () => {
        try {
          return parseOsuUserConfiguration(await readFile(filePath, "utf8"), filePath)
        } catch (cause) {
          if (cause instanceof Error && cause.message.includes(filePath)) {
            throw cause
          }
          throw new Error(`Could not read osu! user configuration ${filePath}`, { cause })
        }
      }),
    ),
  )

  return configurations.sort((left, right) => left.username.localeCompare(right.username))
}

function parseProperties(source: string): Map<string, string> {
  const properties = new Map<string, string>()
  for (const line of source.split(/\r?\n/)) {
    const separator = line.indexOf("=")
    if (separator < 0) {
      continue
    }
    const name = line.slice(0, separator).trim().toLowerCase()
    if (name) {
      properties.set(name, line.slice(separator + 1).trim())
    }
  }
  return properties
}

function readUsername(properties: ReadonlyMap<string, string>, filePath: string): string {
  const username = requiredProperty(properties, "username", filePath)
  if (/\r|\n|\u2028|\u2029/.test(username)) {
    throw invalidProperty("Username", filePath)
  }
  return username
}

function readFullscreen(properties: ReadonlyMap<string, string>, filePath: string): boolean {
  const fullscreen = requiredProperty(properties, "fullscreen", filePath)
  if (fullscreen === "0") {
    return false
  }
  if (fullscreen === "1") {
    return true
  }
  throw invalidProperty("Fullscreen", filePath)
}

function readDimension(
  properties: ReadonlyMap<string, string>,
  property: "width" | "height" | "widthfullscreen" | "heightfullscreen",
  filePath: string,
): number {
  const value = Number(requiredProperty(properties, property, filePath))
  if (!Number.isInteger(value) || value <= 0) {
    throw invalidProperty(property, filePath)
  }
  return value
}

function requiredProperty(
  properties: ReadonlyMap<string, string>,
  property: string,
  filePath: string,
): string {
  const value = properties.get(property)
  if (!value) {
    throw new Error(`Missing ${property} in osu! user configuration ${filePath}`)
  }
  return value
}

function invalidProperty(property: string, filePath: string): Error {
  return new Error(`Invalid ${property} in osu! user configuration ${filePath}`)
}

async function readOsuRoot(osuRoot: string) {
  try {
    return await readdir(osuRoot, { withFileTypes: true })
  } catch (cause) {
    throw new Error(`Could not list osu! user configurations in ${osuRoot}`, { cause })
  }
}
