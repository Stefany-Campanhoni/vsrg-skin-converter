import path from "node:path"
import type { ColumnDirection, ReceptorSet } from "../../../domain/image.ts"
import { readBinaryFile } from "../../../infrastructure/filesystem/bun-file.ts"
import { isImageFullyTransparent } from "../../../infrastructure/image/is-image-fully-transparent.ts"
import { normalizeOsuReceptorImage } from "../../../infrastructure/image/normalize-osu-receptor.ts"
import {
  type ImageDimensions,
  readImageDimensions,
} from "../../../infrastructure/image/read-image-dimensions.ts"
import { prepareEtternaReceptorsUsing } from "./prepare-etterna-receptors.ts"
import {
  type EtternaAssetWriter,
  type PreparedEtternaAsset,
  writePreparedEtternaAssets,
} from "./write-prepared-etterna-assets.ts"

type AssetReader = (filePath: string) => Promise<Uint8Array>
type ReceptorNormalizer = (
  image: Uint8Array,
  targetDimensions: ImageDimensions,
) => Promise<Uint8Array>
type TransparencyInspector = (image: Uint8Array) => Promise<boolean>
type AssetDimensionReader = (image: Uint8Array) => Promise<ImageDimensions>

export interface PrepareEtternaReceptorsOptions {
  receptors: ReceptorSet
  noteDimensions: Readonly<Record<ColumnDirection, ImageDimensions>>
  read?: AssetReader
  normalize?: ReceptorNormalizer
  inspectTransparency?: TransparencyInspector
  readDimensions?: AssetDimensionReader
}

export interface WriteEtternaReceptorsOptions extends PrepareEtternaReceptorsOptions {
  outputDirectory: string
  write?: EtternaAssetWriter
}

export async function prepareEtternaReceptors(
  options: PrepareEtternaReceptorsOptions,
): Promise<readonly PreparedEtternaAsset[]> {
  return prepareEtternaReceptorsUsing({
    ...options,
    read: options.read ?? readBinaryFile,
    readDimensions: options.readDimensions ?? readImageDimensions,
    normalize: options.normalize ?? normalizeOsuReceptorImage,
    inspectTransparency: options.inspectTransparency ?? isImageFullyTransparent,
  })
}

export async function writeEtternaReceptors(options: WriteEtternaReceptorsOptions): Promise<void> {
  const prepared = await prepareEtternaReceptors(options)
  await writePreparedEtternaAssets({
    assets: prepared,
    outputDirectory: path.join(options.outputDirectory, "Receptors"),
    write: options.write,
  })
}
