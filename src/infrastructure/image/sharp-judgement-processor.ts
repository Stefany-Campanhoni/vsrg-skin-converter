import type { JudgementImageVariants } from "../../application/ports/image-operations.ts"
import type { ImageAsset } from "../../domain/image.ts"
import { nativeImageOperations } from "./native-image-operations.ts"

export type { JudgementImageVariants } from "../../application/ports/image-operations.ts"
export function renderJudgementImageVariants(
  asset: ImageAsset,
  density: 1 | 2,
  scale: number,
): Promise<JudgementImageVariants> {
  return nativeImageOperations.renderJudgementVariants(asset, density, scale)
}
