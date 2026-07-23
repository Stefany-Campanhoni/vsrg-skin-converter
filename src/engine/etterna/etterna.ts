import fs from "node:fs"
import path from "node:path"
import { outputPath, templatesPath } from "../../constants/convertion.ts"
import type { SkinFolder, SkinPositions } from "../../constants/game.ts"
import { gamesDefault } from "../../templates/basis.ts"
import { getHitPosition } from "../../transform/hitposition.ts"
import { copyFilesToDirectory, getAllFilesInDirectory } from "../../utils/io.ts"
import { parseLuaFile } from "../../utils/lua.ts"
import { renderTemplateFile } from "../../utils/template.ts"
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

  convertSkin(skin: SkinFolder): void {
    copyFilesToDirectory(templatesPath, outputPath)

    const files = getAllFilesInDirectory(outputPath)
    const skinFiles = getAllFilesInDirectory(skin.fullPath)
    const profileFile = getAllFilesInDirectory(
      path.join(this.gameLocation, "Save", "LocalProfiles", "00000000", "Rebirth_settings"),
    ).at(0)

    if (!profileFile) {
      console.error("Profile file not found.")
      process.exit(1)
    }

    const skinPositions = this.getSkinPositions(profileFile)
    const hitPosition = getHitPosition(skinPositions.hitPosition)
    const outputSkinIni = path.join(outputPath, "skin.ini")

    renderTemplateFile(outputSkinIni, {
      skin_name: skin.name,
      hit_position: hitPosition,
    })

    console.log("Files in skin directory:", skinFiles)
    console.log("Files in output directory:", files)
    console.log("Profile file:", profileFile)
    console.log("Skin positions:", skinPositions)
  }

  getSkinPositions(profileFile: string): SkinPositions {
    const ast = parseLuaFile(profileFile)

    return getGameplay4kCoordinates(ast)
  }
}
