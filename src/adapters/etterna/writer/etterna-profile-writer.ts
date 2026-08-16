import type { SkinModel } from "../../../domain/skin.ts"
import { copyDirectory } from "../../../infrastructure/filesystem/copy-directory.ts"
import { renderEtternaProfileTemplates } from "../templates/render-etterna-profile.ts"

const noteFieldPositionCalibration = 1

export interface EtternaProfileWriterConfiguration {
  readonly profileName: string
  readonly guid: string
  readonly theme: string
}

export class EtternaProfileWriter {
  readonly #templatesDirectory: string

  constructor(templatesDirectory: string) {
    this.#templatesDirectory = templatesDirectory
  }

  async writeProfile(
    skin: SkinModel,
    workspace: string,
    configuration: EtternaProfileWriterConfiguration,
  ): Promise<void> {
    if (skin.game !== "etterna") {
      throw new Error(`Etterna profile writer cannot write a ${skin.game} skin`)
    }

    await copyDirectory(this.#templatesDirectory, workspace)
    await renderEtternaProfileTemplates(workspace, configuration.theme, {
      profileName: configuration.profileName,
      guid: configuration.guid,
      cmod: skin.playfield.scrollSpeed,
      isDownscroll: skin.playfield.isDownscroll ?? false,
      skinName: skin.metadata.name,
      hitPosition: skin.playfield.hitPosition + noteFieldPositionCalibration,
      comboPosition: skin.playfield.comboPosition,
      judgementPosition: skin.playfield.judgementPosition,
      receptorSize: skin.playfield.columnWidth,
    })
  }
}
