import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  type ColumnDirection,
  columnDirections,
  type ReceptorSet,
  type ReceptorState,
  receptorStates,
} from "../../../domain/image.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { isImageFullyTransparent } from "../../../infrastructure/image/is-image-fully-transparent.ts"
import { normalizeOsuReceptorImage } from "../../../infrastructure/image/normalize-osu-receptor.ts"
import {
  type ImageDimensions,
  readImageDimensions,
} from "../../../infrastructure/image/read-image-dimensions.ts"
import {
  getEtternaOutputAssetFilename,
  getEtternaReceptorOutputDimensions,
} from "./etterna-output-asset-policy.ts"
import { runEtternaAssetOperation } from "./run-etterna-asset-operation.ts"
import {
  type EtternaAssetWriter,
  type PreparedEtternaAsset,
  writePreparedEtternaAssets,
} from "./write-prepared-etterna-assets.ts"

type AssetReader = (filePath: string) => Promise<Buffer>
type ReceptorNormalizer = (image: Buffer, targetDimensions: ImageDimensions) => Promise<Buffer>
type TransparencyInspector = (image: Buffer) => Promise<boolean>
type AssetDimensionReader = (image: Buffer) => Promise<ImageDimensions>

const directionTitles: Readonly<Record<ColumnDirection, string>> = {
  left: "Left",
  down: "Down",
  up: "Up",
  right: "Right",
}

const receptorPrefixes: Readonly<Record<ReceptorState, string>> = {
  normal: "release",
  pressed: "pressed",
}

interface ReceptorSource {
  direction: ColumnDirection
  state: ReceptorState
  definition: ReceptorSet[ColumnDirection][ReceptorState]
}

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
  const read = options.read ?? readFile
  const normalize = options.normalize ?? normalizeOsuReceptorImage
  const inspectTransparency = options.inspectTransparency ?? isImageFullyTransparent
  const readDimensions = options.readDimensions ?? readImageDimensions
  const sources = columnDirections.flatMap((direction) =>
    receptorStates.map((state): ReceptorSource => {
      const definition = options.receptors[direction][state]
      return {
        direction,
        state,
        definition,
      }
    }),
  )
  const buffers = await settleAll(
    sources.map((source) =>
      runEtternaAssetOperation(
        `read osu!-derived Etterna ${source.state} receptor for ${source.direction} from '${source.definition.filePath}'`,
        () => read(source.definition.filePath),
      ),
    ),
  )
  return (
    await settleAll(
      columnDirections.map((direction, directionIndex) => {
        const normalIndex = directionIndex * receptorStates.length
        const pressedIndex = normalIndex + 1
        return invokeAsPromise(() =>
          prepareDirection({
            direction,
            normal: requiredSource(sources[normalIndex], direction, "normal"),
            pressed: requiredSource(sources[pressedIndex], direction, "pressed"),
            normalBuffer: requiredBuffer(buffers[normalIndex], direction, "normal"),
            pressedBuffer: requiredBuffer(buffers[pressedIndex], direction, "pressed"),
            noteDimensions: options.noteDimensions[direction],
            normalize,
            inspectTransparency,
            readDimensions,
          }),
        )
      }),
    )
  ).flat()
}

export async function writeEtternaReceptors(options: WriteEtternaReceptorsOptions): Promise<void> {
  const prepared = await prepareEtternaReceptors(options)
  await writePreparedEtternaAssets({
    assets: prepared,
    outputDirectory: path.join(options.outputDirectory, "Receptors"),
    write: options.write,
  })
}

async function prepareDirection(options: {
  direction: ColumnDirection
  normal: ReceptorSource
  pressed: ReceptorSource
  normalBuffer: Buffer
  pressedBuffer: Buffer
  noteDimensions: ImageDimensions
  normalize: ReceptorNormalizer
  inspectTransparency: TransparencyInspector
  readDimensions: AssetDimensionReader
}): Promise<readonly [PreparedEtternaAsset, PreparedEtternaAsset]> {
  const transparency = await settleAll([
    inspectReceptorTransparency(options.normal, options.normalBuffer, options.inspectTransparency),
    inspectReceptorTransparency(
      options.pressed,
      options.pressedBuffer,
      options.inspectTransparency,
    ),
  ])
  const pressedIsTransparent = transparency[1]
  const outputDimensions = getEtternaReceptorOutputDimensions(options.noteDimensions)
  const processedNormal = normalizeReceptor(
    options.normal,
    options.normalBuffer,
    outputDimensions,
    options.normalize,
  )
  const processedPressed = pressedIsTransparent
    ? processedNormal
    : normalizeReceptor(options.pressed, options.pressedBuffer, outputDimensions, options.normalize)
  const [normalBuffer, pressedBuffer] = await settleAll([processedNormal, processedPressed])
  const [normalDimensions, pressedDimensions] = await settleAll([
    readReceptorDimensions(options.normal, normalBuffer, options.readDimensions),
    readReceptorDimensions(options.pressed, pressedBuffer, options.readDimensions),
  ])
  const title = directionTitles[options.direction]

  return [
    {
      filename: getEtternaOutputAssetFilename(
        `${receptorPrefixes.normal} ${title}`,
        normalDimensions,
      ),
      buffer: normalBuffer,
    },
    {
      filename: getEtternaOutputAssetFilename(
        `${receptorPrefixes.pressed} ${title}`,
        pressedDimensions,
      ),
      buffer: pressedBuffer,
    },
  ]
}

function inspectReceptorTransparency(
  source: ReceptorSource,
  buffer: Buffer,
  inspect: TransparencyInspector,
): Promise<boolean> {
  return runEtternaAssetOperation(
    `inspect transparency of osu!-derived Etterna ${source.state} receptor for ${source.direction} from '${source.definition.filePath}'`,
    () => inspect(buffer),
  )
}

function readReceptorDimensions(
  source: ReceptorSource,
  buffer: Buffer,
  readDimensions: AssetDimensionReader,
): Promise<ImageDimensions> {
  return runEtternaAssetOperation(
    `read dimensions of osu!-derived Etterna ${source.state} receptor for ${source.direction} from '${source.definition.filePath}'`,
    () => readDimensions(buffer),
  )
}

function normalizeReceptor(
  source: ReceptorSource,
  buffer: Buffer,
  targetDimensions: ImageDimensions,
  normalize: ReceptorNormalizer,
): Promise<Buffer> {
  return runEtternaAssetOperation(
    `normalize osu!-derived Etterna ${source.state} receptor for ${source.direction} from '${source.definition.filePath}'`,
    () => normalize(buffer, targetDimensions),
  )
}

function requiredSource(
  source: ReceptorSource | undefined,
  direction: ColumnDirection,
  state: ReceptorState,
): ReceptorSource {
  if (!source) {
    throw new Error(`Missing ${state} receptor source for ${direction}`)
  }
  return source
}

function requiredBuffer(
  buffer: Buffer | undefined,
  direction: ColumnDirection,
  state: ReceptorState,
): Buffer {
  if (!buffer) {
    throw new Error(`Missing ${state} receptor buffer for ${direction}`)
  }
  return buffer
}
