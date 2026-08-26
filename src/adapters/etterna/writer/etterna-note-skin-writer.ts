import path from "node:path"
import type { SkinWriter } from "../../../application/ports/skin-writer.ts"
import { type ColumnDirection, columnDirections, type TapNoteSet } from "../../../domain/image.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import { copyDirectory } from "../../../infrastructure/filesystem/copy-directory.ts"
import {
  type ImageDimensions,
  readImageDimensions,
} from "../../../infrastructure/image/read-image-dimensions.ts"
import { runEtternaAssetOperation } from "./run-etterna-asset-operation.ts"
import { prepareEtternaNotes } from "./write-etterna-notes.ts"
import { prepareEtternaReceptors } from "./write-etterna-receptors.ts"
import { writePreparedEtternaAssets } from "./write-prepared-etterna-assets.ts"

export class EtternaNoteSkinWriter implements SkinWriter {
  readonly game = "etterna"
  readonly #templatesDirectory: string

  constructor(templatesDirectory: string) {
    this.#templatesDirectory = templatesDirectory
  }

  async writeSkin(skin: SkinModel, workspace: string): Promise<void> {
    if (skin.game !== this.game) {
      throw new Error(`Etterna writer cannot write a ${skin.game} skin`)
    }
    const receptors = skin.assets.receptors
    if (!receptors) {
      throw new Error("Etterna skin model does not contain receptors")
    }
    const tapNotes = skin.assets.tapNotes
    if (!tapNotes) {
      throw new Error("Etterna skin model does not contain tap notes")
    }

    await copyDirectory(this.#templatesDirectory, workspace)
    const noteDimensions = await readTapNoteDimensions(tapNotes)
    const [preparedReceptors, preparedNotes] = await settleAll([
      prepareEtternaReceptors({ receptors, noteDimensions }),
      prepareEtternaNotes({ notes: tapNotes }),
    ])
    await settleAll([
      writePreparedEtternaAssets({
        assets: preparedReceptors,
        outputDirectory: path.join(workspace, "Receptors"),
      }),
      writePreparedEtternaAssets({
        assets: preparedNotes,
        outputDirectory: path.join(workspace, "Notes"),
      }),
    ])
  }
}

async function readTapNoteDimensions(
  tapNotes: TapNoteSet,
): Promise<Readonly<Record<ColumnDirection, ImageDimensions>>> {
  const dimensions = await settleAll(
    columnDirections.map((direction) => {
      const filePath = tapNotes[direction].filePath
      return runEtternaAssetOperation(
        `read osu!-derived Etterna tap note dimensions for ${direction} from '${filePath}'`,
        () => readImageDimensions(filePath),
      )
    }),
  )
  return {
    left: requiredDimensions(dimensions[0], "left"),
    down: requiredDimensions(dimensions[1], "down"),
    up: requiredDimensions(dimensions[2], "up"),
    right: requiredDimensions(dimensions[3], "right"),
  }
}

function requiredDimensions(
  dimensions: ImageDimensions | undefined,
  direction: ColumnDirection,
): ImageDimensions {
  if (!dimensions) {
    throw new Error(`Missing ${direction} tap note dimensions`)
  }
  return dimensions
}
