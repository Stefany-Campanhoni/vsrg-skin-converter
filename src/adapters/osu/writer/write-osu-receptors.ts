import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { gameDefaults } from "../../../config/game-defaults.ts"
import { columnDirections, type ImageAsset, type ReceptorSet } from "../../../domain/image.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { isImageFullyTransparent } from "../../../infrastructure/image/is-image-fully-transparent.ts"
import {
  type RenderReceptorOptions,
  renderReceptorImage,
} from "../../../infrastructure/image/sharp-image-processor.ts"
import {
  getOsuReceptorLogicalVerticalOffset,
  getOsuReceptorNormalizationSize,
  getOsuReceptorVerticalScale,
} from "./osu-receptor-calibration.ts"

type ReceptorRenderer = (definition: ImageAsset, options: RenderReceptorOptions) => Promise<Buffer>
type ReceptorWriter = (filePath: string, buffer: Buffer) => Promise<void>
type ReceptorTransparencyInspector = (image: Buffer) => Promise<boolean>

const osuReceptorCanvasPixelsPerHitPositionPoint = 2
const osuLogicalCanvasHeight = 480

export interface WriteOsuReceptorsOptions {
  receptors: ReceptorSet
  outputDirectory: string
  hitPosition: number
  columnWidth: number
  baseImagePath: string
  render?: ReceptorRenderer
  write?: ReceptorWriter
  inspectTransparency?: ReceptorTransparencyInspector
}

export async function writeOsuReceptors(options: WriteOsuReceptorsOptions): Promise<void> {
  const render = options.render ?? renderReceptorImage
  const write = options.write ?? writeFile
  const inspectTransparency = options.inspectTransparency ?? isImageFullyTransparent
  const renderOptions: RenderReceptorOptions = {
    hitPosition: options.hitPosition,
    referenceHitPosition: gameDefaults.osu.hitPosition,
    pixelsPerHitPositionPoint: osuReceptorCanvasPixelsPerHitPositionPoint,
    verticalScale: getOsuReceptorVerticalScale(options.columnWidth),
    logicalCanvasHeight: osuLogicalCanvasHeight,
    renderedWidth: options.columnWidth,
    logicalBottomOffset: getOsuReceptorLogicalVerticalOffset(),
    normalizationSize: getOsuReceptorNormalizationSize(),
    baseImagePath: options.baseImagePath,
  }
  const prepared = (
    await settleAll(
      columnDirections.map(async (direction) => {
        const [normal, pressed] = await settleAll([
          invokeAsPromise(() => render(options.receptors[direction].normal, renderOptions)),
          invokeAsPromise(() => render(options.receptors[direction].pressed, renderOptions)),
        ])
        let pressedIsTransparent: boolean
        try {
          pressedIsTransparent = await invokeAsPromise(() => inspectTransparency(pressed))
        } catch (cause) {
          throw new Error(`Could not inspect pressed receptor for ${direction}`, { cause })
        }

        return [
          { filename: `${direction}@2x.png`, buffer: normal },
          {
            filename: `${direction}_tap@2x.png`,
            buffer: pressedIsTransparent ? normal : pressed,
          },
        ]
      }),
    )
  ).flat()

  const receptorDirectory = path.join(options.outputDirectory, "mania", "receptors")
  await mkdir(receptorDirectory, { recursive: true })
  await settleAll(
    prepared.map(({ filename, buffer }) =>
      invokeAsPromise(() => write(path.join(receptorDirectory, filename), buffer)),
    ),
  )
}
