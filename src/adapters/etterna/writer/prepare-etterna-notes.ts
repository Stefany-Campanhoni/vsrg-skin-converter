import type { ImageDimensions } from "../../../application/ports/image-operations.ts"
import { type ColumnDirection, columnDirections, type TapNoteSet } from "../../../domain/image.ts"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  etternaTapNoteOutputWidth,
  getEtternaOutputAssetFilename,
} from "./etterna-output-asset-policy.ts"
import type { PreparedEtternaAsset } from "./prepared-etterna-asset.ts"
import { runEtternaAssetOperation } from "./run-etterna-asset-operation.ts"

type AssetReader = (filePath: string) => Promise<Uint8Array>
type AssetResizer = (image: Uint8Array, width: number) => Promise<Uint8Array>
type AssetDimensionReader = (image: Uint8Array) => Promise<ImageDimensions>

const tapNoteLogicalNames: Readonly<Record<ColumnDirection, string>> = {
  left: "_Left Tap Note",
  down: "_Down Tap Note",
  up: "_Up Tap Note",
  right: "_Right Tap Note",
}

export interface PrepareEtternaNotesOptions {
  notes: TapNoteSet
  read: AssetReader
  resize: AssetResizer
  readDimensions: AssetDimensionReader
}

export async function prepareEtternaNotesUsing(
  options: PrepareEtternaNotesOptions,
): Promise<readonly PreparedEtternaAsset[]> {
  const { read, resize, readDimensions } = options
  const assets = columnDirections.map((direction) => ({
    direction,
    definition: options.notes[direction],
  }))
  const buffers = await settleAll(
    assets.map(({ definition, direction }) =>
      runEtternaAssetOperation(
        `read osu!-derived Etterna tap note for ${direction} from '${definition.filePath}'`,
        () => read(definition.filePath),
      ),
    ),
  )
  return settleAll(
    assets.map(({ definition, direction }, index) =>
      runEtternaAssetOperation(
        `resize osu!-derived Etterna tap note for ${direction} from '${definition.filePath}' proportionally to width ${etternaTapNoteOutputWidth}`,
        async () => {
          const buffer = buffers[index]
          if (!buffer) {
            throw new Error(`Missing read buffer for ${direction} tap note`)
          }
          const resized = await resize(buffer, etternaTapNoteOutputWidth)
          const dimensions = await readDimensions(resized)
          return {
            filename: getEtternaOutputAssetFilename(tapNoteLogicalNames[direction], dimensions),
            buffer: resized,
          }
        },
      ),
    ),
  )
}
