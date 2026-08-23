import type { ImageDimensions } from "../../../infrastructure/image/read-image-dimensions.ts"

const etternaLogicalWidth = 64

export const etternaTapNoteOutputWidth = 150
export const etternaReceptorOutputWidth = 146

export function getEtternaOutputAssetFilename(
  logicalName: string,
  dimensions: ImageDimensions,
): string {
  const logicalHeight = Math.max(
    1,
    Math.round((dimensions.height * etternaLogicalWidth) / dimensions.width),
  )
  return `${logicalName} (res ${etternaLogicalWidth}x${logicalHeight}).png`
}
