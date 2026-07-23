import path from "node:path"
import type { SkinWriter } from "../../../application/ports/skin-writer.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { copyDirectory } from "../../../infrastructure/filesystem/copy-directory.ts"
import { renderTemplateFile } from "../templates/render-osu-template.ts"
import { writeOsuNotes } from "./write-osu-notes.ts"
import { writeOsuReceptors } from "./write-osu-receptors.ts"

export class OsuSkinWriter implements SkinWriter {
  readonly game = "osu"
  readonly #templatesDirectory: string

  constructor(templatesDirectory: string) {
    this.#templatesDirectory = templatesDirectory
  }

  async writeSkin(skin: SkinModel, workspace: string): Promise<void> {
    if (skin.game !== this.game) {
      throw new Error(`osu writer cannot write a ${skin.game} skin`)
    }
    const receptors = skin.assets.receptors
    if (!receptors) {
      throw new Error("osu skin model does not contain receptors")
    }
    const tapNotes = skin.assets.tapNotes
    if (!tapNotes) {
      throw new Error("osu skin model does not contain tap notes")
    }

    await copyDirectory(this.#templatesDirectory, workspace)
    const skinIniPath = path.join(workspace, "skin.ini")
    const baseImagePath = path.join(workspace, "receptor-base.png")
    await renderTemplateFile(skinIniPath, {
      skin_name: skin.metadata.name,
      hit_position: skin.playfield.hitPosition,
      column_width: skin.playfield.columnWidth,
    })
    await Promise.all([
      writeOsuReceptors({
        receptors,
        outputDirectory: workspace,
        hitPosition: skin.playfield.hitPosition,
        columnWidth: skin.playfield.columnWidth,
        baseImagePath,
      }),
      writeOsuNotes({
        notes: tapNotes,
        outputDirectory: workspace,
      }),
    ])
  }
}
