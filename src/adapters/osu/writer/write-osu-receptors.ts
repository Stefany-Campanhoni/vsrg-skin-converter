import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { gameDefaults } from "../../../config/game-defaults.ts"
import {
  columnDirections,
  type ImageAsset,
  type ReceptorSet,
  receptorStates,
} from "../../../domain/image.ts"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  type RenderReceptorOptions,
  renderReceptorImage,
} from "../../../infrastructure/image/sharp-image-processor.ts"
import {
  getOsuReceptorLogicalVerticalOffset,
  getOsuReceptorVerticalScale,
} from "./osu-receptor-calibration.ts"

type ReceptorRenderer = (definition: ImageAsset, options: RenderReceptorOptions) => Promise<Buffer>
type ReceptorWriter = (filePath: string, buffer: Buffer) => Promise<void>

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
}

export async function writeOsuReceptors(options: WriteOsuReceptorsOptions): Promise<void> {
  const render = options.render ?? renderReceptorImage
  const write = options.write ?? writeFile
  const renderOptions: RenderReceptorOptions = {
    hitPosition: options.hitPosition,
    referenceHitPosition: gameDefaults.osu.hitPosition,
    pixelsPerHitPositionPoint: osuReceptorCanvasPixelsPerHitPositionPoint,
    verticalScale: getOsuReceptorVerticalScale(options.columnWidth),
    logicalCanvasHeight: osuLogicalCanvasHeight,
    renderedWidth: options.columnWidth,
    logicalBottomOffset: getOsuReceptorLogicalVerticalOffset(),
    baseImagePath: options.baseImagePath,
  }
  const prepared = await settleAll(
    columnDirections.flatMap((direction) =>
      receptorStates.map(async (state) => ({
        filename: `${direction}${state === "pressed" ? "_tap" : ""}@2x.png`,
        buffer: await render(options.receptors[direction][state], renderOptions),
      })),
    ),
  )

  const receptorDirectory = path.join(options.outputDirectory, "mania", "receptors")
  await mkdir(receptorDirectory, { recursive: true })
  await settleAll(
    prepared.map(({ filename, buffer }) => write(path.join(receptorDirectory, filename), buffer)),
  )
}
