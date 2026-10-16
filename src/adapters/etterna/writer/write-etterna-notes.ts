import path from "node:path"
import type { TapNoteSet } from "../../../domain/image.ts"
import { readBinaryFile } from "../../../infrastructure/filesystem/bun-file.ts"
import {
  type ImageDimensions,
  readImageDimensions,
} from "../../../infrastructure/image/read-image-dimensions.ts"
import { resizeImageToWidth } from "../../../infrastructure/image/resize-image-to-width.ts"
import { prepareEtternaNotesUsing } from "./prepare-etterna-notes.ts"
import {
  type EtternaAssetWriter,
  type PreparedEtternaAsset,
  writePreparedEtternaAssets,
} from "./write-prepared-etterna-assets.ts"

type AssetReader = (filePath: string) => Promise<Uint8Array>
type AssetResizer = typeof resizeImageToWidth
type AssetDimensionReader = (image: Uint8Array) => Promise<ImageDimensions>

export interface PrepareEtternaNotesOptions {
  notes: TapNoteSet
  read?: AssetReader
  resize?: AssetResizer
  readDimensions?: AssetDimensionReader
}

export interface WriteEtternaNotesOptions extends PrepareEtternaNotesOptions {
  outputDirectory: string
  write?: EtternaAssetWriter
}

export async function prepareEtternaNotes(
  options: PrepareEtternaNotesOptions,
): Promise<readonly PreparedEtternaAsset[]> {
  return prepareEtternaNotesUsing({
    ...options,
    read: options.read ?? readBinaryFile,
    readDimensions: options.readDimensions ?? readImageDimensions,
    resize: options.resize ?? resizeImageToWidth,
  })
}

export async function writeEtternaNotes(options: WriteEtternaNotesOptions): Promise<void> {
  const prepared = await prepareEtternaNotes(options)
  await writePreparedEtternaAssets({
    assets: prepared,
    outputDirectory: path.join(options.outputDirectory, "Notes"),
    write: options.write,
  })
}
