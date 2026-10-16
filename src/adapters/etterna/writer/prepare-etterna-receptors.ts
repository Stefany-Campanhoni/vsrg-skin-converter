import type { ImageDimensions } from "../../../application/ports/image-operations.ts"
import {
  type ColumnDirection,
  columnDirections,
  type ReceptorSet,
  type ReceptorState,
  receptorStates,
} from "../../../domain/image.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  getEtternaOutputAssetFilename,
  getEtternaReceptorOutputDimensions,
} from "./etterna-output-asset-policy.ts"
import type { PreparedEtternaAsset } from "./prepared-etterna-asset.ts"
import { runEtternaAssetOperation } from "./run-etterna-asset-operation.ts"

type AssetReader = (filePath: string) => Promise<Uint8Array>
type ReceptorNormalizer = (
  image: Uint8Array,
  targetDimensions: ImageDimensions,
) => Promise<Uint8Array>
type TransparencyInspector = (image: Uint8Array) => Promise<boolean>
type AssetDimensionReader = (image: Uint8Array) => Promise<ImageDimensions>

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
  read: AssetReader
  normalize: ReceptorNormalizer
  inspectTransparency: TransparencyInspector
  readDimensions: AssetDimensionReader
}

export async function prepareEtternaReceptorsUsing(
  options: PrepareEtternaReceptorsOptions,
): Promise<readonly PreparedEtternaAsset[]> {
  const { read, normalize, inspectTransparency, readDimensions } = options
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

async function prepareDirection(options: {
  direction: ColumnDirection
  normal: ReceptorSource
  pressed: ReceptorSource
  normalBuffer: Uint8Array
  pressedBuffer: Uint8Array
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
  buffer: Uint8Array,
  inspect: TransparencyInspector,
): Promise<boolean> {
  return runEtternaAssetOperation(
    `inspect transparency of osu!-derived Etterna ${source.state} receptor for ${source.direction} from '${source.definition.filePath}'`,
    () => inspect(buffer),
  )
}

function readReceptorDimensions(
  source: ReceptorSource,
  buffer: Uint8Array,
  readDimensions: AssetDimensionReader,
): Promise<ImageDimensions> {
  return runEtternaAssetOperation(
    `read dimensions of osu!-derived Etterna ${source.state} receptor for ${source.direction} from '${source.definition.filePath}'`,
    () => readDimensions(buffer),
  )
}

function normalizeReceptor(
  source: ReceptorSource,
  buffer: Uint8Array,
  targetDimensions: ImageDimensions,
  normalize: ReceptorNormalizer,
): Promise<Uint8Array> {
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
  buffer: Uint8Array | undefined,
  direction: ColumnDirection,
  state: ReceptorState,
): Uint8Array {
  if (!buffer) {
    throw new Error(`Missing ${state} receptor buffer for ${direction}`)
  }
  return buffer
}
