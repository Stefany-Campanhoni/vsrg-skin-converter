import type { RenderReceptorOptions } from "../../../application/ports/image-operations.ts"
import { columnDirections, type ImageAsset, type ReceptorSet } from "../../../domain/image.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  getOsuReceptorLogicalVerticalOffset,
  getOsuReceptorNormalizationSize,
  getOsuReceptorVerticalScale,
} from "./osu-receptor-calibration.ts"

type ReceptorRenderer = (
  definition: ImageAsset,
  options: RenderReceptorOptions,
) => Promise<Uint8Array>
type ReceptorTransparencyInspector = (image: Uint8Array) => Promise<boolean>

const osuReceptorCanvasPixelsPerHitPositionPoint = 2
const osuLogicalCanvasHeight = 480
const osuReceptorImageDensity = 2
const osuLegacyCoordinateScale = 768 / osuLogicalCanvasHeight

export interface PrepareOsuReceptorsOptions {
  receptors: ReceptorSet
  hitPosition: number
  columnWidth: number
  baseImagePath: string
  render: ReceptorRenderer
  inspectTransparency: ReceptorTransparencyInspector
}

export async function prepareOsuReceptors(
  options: PrepareOsuReceptorsOptions,
): Promise<readonly { filename: string; buffer: Uint8Array }[]> {
  const render = options.render
  const inspectTransparency = options.inspectTransparency
  const renderOptions: RenderReceptorOptions = {
    hitPosition: options.hitPosition,
    referenceHitPosition: 438,
    pixelsPerHitPositionPoint: osuReceptorCanvasPixelsPerHitPositionPoint,
    verticalScale: getOsuReceptorVerticalScale(options.columnWidth),
    logicalCanvasHeight: osuLogicalCanvasHeight,
    // Key images fit the column horizontally; their vertical density stays fixed.
    pixelsPerLogicalPoint: osuReceptorImageDensity * osuLegacyCoordinateScale,
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

  return prepared
}
