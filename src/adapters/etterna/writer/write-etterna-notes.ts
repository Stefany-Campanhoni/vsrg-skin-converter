import { readFile } from "node:fs/promises"
import path from "node:path"
import { type ColumnDirection, columnDirections, type TapNoteSet } from "../../../domain/image.ts"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import { resizeImageExact } from "../../../infrastructure/image/resize-image-exact.ts"
import {
  etternaTapNoteOutputSize,
  getEtternaOutputAssetFilename,
} from "./etterna-output-asset-policy.ts"
import { runEtternaAssetOperation } from "./run-etterna-asset-operation.ts"
import {
  type EtternaAssetWriter,
  type PreparedEtternaAsset,
  writePreparedEtternaAssets,
} from "./write-prepared-etterna-assets.ts"

type AssetReader = (filePath: string) => Promise<Buffer>
type AssetResizer = typeof resizeImageExact

const tapNoteLogicalNames: Readonly<Record<ColumnDirection, string>> = {
  left: "_Left Tap Note",
  down: "_Down Tap Note",
  up: "_Up Tap Note",
  right: "_Right Tap Note",
}

export interface PrepareEtternaNotesOptions {
  notes: TapNoteSet
  read?: AssetReader
  resize?: AssetResizer
}

export interface WriteEtternaNotesOptions extends PrepareEtternaNotesOptions {
  outputDirectory: string
  write?: EtternaAssetWriter
}

export async function prepareEtternaNotes(
  options: PrepareEtternaNotesOptions,
): Promise<readonly PreparedEtternaAsset[]> {
  const read = options.read ?? readFile
  const resize = options.resize ?? resizeImageExact
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
        `resize osu!-derived Etterna tap note for ${direction} from '${definition.filePath}' to 150x150`,
        async () => {
          const buffer = buffers[index]
          if (!buffer) {
            throw new Error(`Missing read buffer for ${direction} tap note`)
          }
          return {
            filename: getEtternaOutputAssetFilename(tapNoteLogicalNames[direction]),
            buffer: await resize(buffer, etternaTapNoteOutputSize),
          }
        },
      ),
    ),
  )
}

export async function writeEtternaNotes(options: WriteEtternaNotesOptions): Promise<void> {
  const prepared = await prepareEtternaNotes(options)
  await writePreparedEtternaAssets({
    assets: prepared,
    outputDirectory: path.join(options.outputDirectory, "Notes"),
    write: options.write,
  })
}
