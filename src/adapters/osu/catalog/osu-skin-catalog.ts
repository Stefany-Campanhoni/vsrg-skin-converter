import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { SkinCatalog } from "../../../application/ports/skin-catalog.ts"
import type { SkinReference } from "../../../domain/skin.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { parseOsuSkinIni, readOsuSkinName } from "../skin-ini/osu-skin-ini.ts"

export class OsuSkinCatalog implements SkinCatalog {
  async listSkins(location: string): Promise<SkinReference[]> {
    const skinRoot = path.join(location, "Skins")
    const entries = await readSkinRoot(skinRoot)
    const skinDirectories = entries.filter((entry) => entry.isDirectory())
    const skins = await settleAll(
      skinDirectories.map((entry) =>
        invokeAsPromise(() => readSkin(location, skinRoot, entry.name)),
      ),
    )
    return skins
      .filter((skin): skin is SkinReference => skin !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name))
  }
}

async function readSkin(
  location: string,
  skinRoot: string,
  directoryName: string,
): Promise<SkinReference | undefined> {
  const skinDirectory = path.join(skinRoot, directoryName)
  try {
    const entries = await readdir(skinDirectory, { withFileTypes: true })
    const skinIniEntries = entries.filter((entry) => entry.name.toLowerCase() === "skin.ini")
    if (skinIniEntries.length === 0) {
      return undefined
    }
    const skinIniEntry = skinIniEntries[0]
    if (skinIniEntries.length !== 1 || !skinIniEntry?.isFile()) {
      throw new Error(`Expected exactly one skin.ini in ${skinDirectory}`)
    }
    const iniPath = path.join(skinDirectory, skinIniEntry.name)
    const name =
      readOsuSkinName(parseOsuSkinIni(await readFile(iniPath, "utf8"), iniPath)) ?? directoryName
    return { game: "osu", name, sourcePath: skinDirectory, gameRoot: location }
  } catch (cause) {
    throw new Error(`Could not read osu! skin ${directoryName} from ${skinDirectory}`, { cause })
  }
}

async function readSkinRoot(skinRoot: string) {
  try {
    return await readdir(skinRoot, { withFileTypes: true })
  } catch (cause) {
    throw new Error(`Could not list osu! skins in ${skinRoot}`, { cause })
  }
}
