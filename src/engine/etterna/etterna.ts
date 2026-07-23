import fs from "node:fs"
import path from "node:path"
import { outputPath, templatesPath } from "../../constants/convertion.ts"
import type { SkinFolder, SkinPositions } from "../../constants/game.ts"
import { convertEtternaToOsu } from "../../conversion/etterna-to-osu.ts"
import { gamesDefault } from "../../templates/basis.ts"
import { getAllFilesInDirectory } from "../../utils/io.ts"
import { parseLuaFile } from "../../utils/lua.ts"
import type { Engine } from "../engine.ts"
import { getGameplay4kCoordinates } from "./etterna-profile.ts"

export class EtternaEngine implements Engine {
  etternaDefault = gamesDefault.etterna
  gameLocation: string = ""

  constructor() {
    this.gameLocation = this.etternaDefault.location
  }

  getLocation(): string {
    return this.gameLocation
  }

  setLocation(location: string): void {
    this.gameLocation = location
  }

  getSkins(): SkinFolder[] {
    const targetPath = path.join(this.gameLocation, "NoteSkins", "dance")

    return fs
      .readdirSync(targetPath, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((dir) => ({
        name: dir.name,
        fullPath: path.join(targetPath, dir.name),
      }))
  }

  async convertSkin(skin: SkinFolder): Promise<void> {
    const profileFile = getAllFilesInDirectory(
      path.join(this.gameLocation, "Save", "LocalProfiles", "00000000", "Rebirth_settings"),
    ).at(0)

    if (!profileFile) {
      throw new Error("Profile file not found.")
    }

    const skinPositions = this.getSkinPositions(profileFile)
    const result = await convertEtternaToOsu({
      skin,
      skinPositions,
      templatesDirectory: templatesPath,
      outputDirectory: outputPath,
    })

    for (const warning of result.warnings) {
      console.warn(`Receptor conversion warning: ${warning}`)
    }
  }

  getSkinPositions(profileFile: string): SkinPositions {
    const ast = parseLuaFile(profileFile)

    return getGameplay4kCoordinates(ast)
  }
}
