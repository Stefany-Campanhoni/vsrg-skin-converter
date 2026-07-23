import path from "node:path"
import type { SkinFolder, SkinPositions } from "../constants/game.ts"
import { analyzeEtternaReceptors } from "../engine/etterna/receptors/analyze-noteskin.ts"
import { writeOsuReceptors } from "../engine/osu/write-receptors.ts"
import { getHitPosition } from "../transform/hitposition.ts"
import { copyFilesToDirectory } from "../utils/io.ts"
import { renderTemplateFile } from "../utils/template.ts"

export interface ConvertEtternaToOsuOptions {
  skin: SkinFolder
  skinPositions: SkinPositions
  templatesDirectory: string
  outputDirectory: string
}

export interface ConversionResult {
  warnings: string[]
}

export async function convertEtternaToOsu(
  options: ConvertEtternaToOsuOptions,
): Promise<ConversionResult> {
  copyFilesToDirectory(options.templatesDirectory, options.outputDirectory)

  const hitPosition = getHitPosition(options.skinPositions.hitPosition)
  const analysis = await analyzeEtternaReceptors(options.skin.fullPath)
  const outputSkinIni = path.join(options.outputDirectory, "skin.ini")
  const baseImagePath = path.join(options.outputDirectory, "receptor-base.png")

  renderTemplateFile(outputSkinIni, {
    skin_name: options.skin.name,
    hit_position: hitPosition,
  })
  await writeOsuReceptors({
    receptors: analysis.receptors,
    outputDirectory: options.outputDirectory,
    hitPosition,
    baseImagePath,
  })

  return { warnings: analysis.warnings }
}
