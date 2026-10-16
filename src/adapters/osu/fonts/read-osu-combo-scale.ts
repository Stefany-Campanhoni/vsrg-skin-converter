import { readImageDimensions } from "../../../infrastructure/image/read-image-dimensions.ts"
import { resolveOsuPngAsset } from "../assets/resolve-osu-png-asset.ts"
import { type ReadOsuComboScaleOptions, readOsuComboScaleUsing } from "./osu-combo-scale-policy.ts"

export type { ReadOsuComboScaleOptions } from "./osu-combo-scale-policy.ts"
export function readOsuComboScale(options: ReadOsuComboScaleOptions): Promise<number> {
  return readOsuComboScaleUsing(options, { resolveOsuPngAsset, readImageDimensions })
}
