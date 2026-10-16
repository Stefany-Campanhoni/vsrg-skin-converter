import type { ImageDimensions } from "../../../application/ports/image-operations.ts"
import { type ColumnDirection, columnDirections, type TapNoteSet } from "../../../domain/image.ts"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import { runEtternaAssetOperation } from "./run-etterna-asset-operation.ts"
export async function readEtternaTapNoteDimensions(
  tapNotes: TapNoteSet,
  readImageDimensions: (id: string) => Promise<ImageDimensions>,
): Promise<Readonly<Record<ColumnDirection, ImageDimensions>>> {
  const dimensions = await settleAll(
    columnDirections.map((direction) => {
      const filePath = tapNotes[direction].filePath
      return runEtternaAssetOperation(
        `read osu!-derived Etterna tap note dimensions for ${direction} from '${filePath}'`,
        () => readImageDimensions(filePath),
      )
    }),
  )
  return {
    left: requiredDimensions(dimensions[0], "left"),
    down: requiredDimensions(dimensions[1], "down"),
    up: requiredDimensions(dimensions[2], "up"),
    right: requiredDimensions(dimensions[3], "right"),
  }
}

function requiredDimensions(
  dimensions: ImageDimensions | undefined,
  direction: ColumnDirection,
): ImageDimensions {
  if (!dimensions) {
    throw new Error(`Missing ${direction} tap note dimensions`)
  }
  return dimensions
}
