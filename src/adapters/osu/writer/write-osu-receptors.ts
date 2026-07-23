import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { gameDefaults } from "../../../config/game-defaults.ts"
import {
  columnDirections,
  type ImageAsset,
  type ReceptorSet,
  receptorStates,
} from "../../../domain/image.ts"
import {
  type RenderReceptorOptions,
  renderReceptorImage,
} from "../../../infrastructure/image/sharp-image-processor.ts"
import { getOsuReceptorVerticalScale } from "./osu-receptor-calibration.ts"

type ReceptorRenderer = (definition: ImageAsset, options: RenderReceptorOptions) => Promise<Buffer>

const osuReceptorCanvasPixelsPerHitPositionPoint = 2

export interface WriteOsuReceptorsOptions {
  receptors: ReceptorSet
  outputDirectory: string
  hitPosition: number
  columnWidth: number
  baseImagePath: string
  render?: ReceptorRenderer
}

export async function writeOsuReceptors(options: WriteOsuReceptorsOptions): Promise<void> {
  const render = options.render ?? renderReceptorImage
  const renderOptions: RenderReceptorOptions = {
    hitPosition: options.hitPosition,
    referenceHitPosition: gameDefaults.osu.hitPosition,
    pixelsPerHitPositionPoint: osuReceptorCanvasPixelsPerHitPositionPoint,
    verticalScale: getOsuReceptorVerticalScale(options.columnWidth),
    baseImagePath: options.baseImagePath,
  }
  const prepared = await Promise.all(
    columnDirections.flatMap((direction) =>
      receptorStates.map(async (state) => ({
        filename: `${direction}${state === "pressed" ? "_tap" : ""}@2x.png`,
        buffer: await render(options.receptors[direction][state], renderOptions),
      })),
    ),
  )

  const receptorDirectory = path.join(options.outputDirectory, "mania", "receptors")
  await mkdir(receptorDirectory, { recursive: true })
  await Promise.all(
    prepared.map(({ filename, buffer }) =>
      writeFile(path.join(receptorDirectory, filename), buffer),
    ),
  )
}
