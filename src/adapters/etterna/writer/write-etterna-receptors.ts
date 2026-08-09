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
import { resizeImageExact } from "../../../infrastructure/image/resize-image-exact.ts"
import {
  etternaReceptorOutputSize,
  getEtternaOutputAssetFilename,
} from "./etterna-output-asset-policy.ts"
import { runEtternaAssetOperation } from "./run-etterna-asset-operation.ts"
import {
  type EtternaAssetWriter,
  type PreparedEtternaAsset,
  writePreparedEtternaAssets,
} from "./write-prepared-etterna-assets.ts"

type AssetReader = (filePath: string) => Promise<Buffer>
type ReceptorNormalizer = (image: Buffer) => Promise<Buffer>
type TransparencyInspector = (image: Buffer) => Promise<boolean>

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
  read?: AssetReader
  normalize?: ReceptorNormalizer
  inspectTransparency?: TransparencyInspector
  resize?: typeof resizeImageExact
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
  const resize = options.resize ?? resizeImageExact
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
            normalize,
            inspectTransparency,
            resize,
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
  normalize: ReceptorNormalizer
  inspectTransparency: TransparencyInspector
  resize: typeof resizeImageExact
}): Promise<readonly [PreparedEtternaAsset, PreparedEtternaAsset]> {
  const [normalIsTransparent, pressedIsTransparent] = await settleAll([
    inspectReceptorTransparency(options.normal, options.normalBuffer, options.inspectTransparency),
    inspectReceptorTransparency(
      options.pressed,
      options.pressedBuffer,
      options.inspectTransparency,
    ),
  ])
  const processedNormal = normalIsTransparent
    ? resizeReceptor(options.normal, options.normalBuffer, options.resize)
    : normalizeAndResizeReceptor(
        options.normal,
        options.normalBuffer,
        options.normalize,
        options.resize,
      )
  const processedPressed = pressedIsTransparent
    ? processedNormal
    : normalizeAndResizeReceptor(
        options.pressed,
        options.pressedBuffer,
        options.normalize,
        options.resize,
      )
  const [normalBuffer, pressedBuffer] = await settleAll([processedNormal, processedPressed])
  const title = directionTitles[options.direction]

  return [
    {
      filename: getEtternaOutputAssetFilename(`${receptorPrefixes.normal} ${title}`),
      buffer: normalBuffer,
    },
    {
      filename: getEtternaOutputAssetFilename(`${receptorPrefixes.pressed} ${title}`),
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

function normalizeReceptor(
  source: ReceptorSource,
  buffer: Buffer,
  normalize: ReceptorNormalizer,
): Promise<Buffer> {
  return runEtternaAssetOperation(
    `normalize osu!-derived Etterna ${source.state} receptor for ${source.direction} from '${source.definition.filePath}'`,
    () => normalize(buffer),
  )
}

function normalizeAndResizeReceptor(
  source: ReceptorSource,
  buffer: Buffer,
  normalize: ReceptorNormalizer,
  resize: typeof resizeImageExact,
): Promise<Buffer> {
  return normalizeReceptor(source, buffer, normalize).then((square) =>
    resizeReceptor(source, square, resize),
  )
}

function resizeReceptor(
  source: ReceptorSource,
  buffer: Buffer,
  resize: typeof resizeImageExact,
): Promise<Buffer> {
  return runEtternaAssetOperation(
    `resize osu!-derived Etterna ${source.state} receptor for ${source.direction} from '${source.definition.filePath}' to ${etternaReceptorOutputSize.width}x${etternaReceptorOutputSize.height}`,
    () => resize(buffer, etternaReceptorOutputSize),
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
