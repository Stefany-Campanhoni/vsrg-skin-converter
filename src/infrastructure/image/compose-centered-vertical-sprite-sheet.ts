import type { CenteredSpriteSheetFrame } from "../../application/ports/image-operations.ts"
import { nativeRasterBackend } from "./native-image-operations.ts"
import { composeVerticalSheet } from "./shared-image-operations.ts"

export type { CenteredSpriteSheetFrame } from "../../application/ports/image-operations.ts"
export interface DecodedSpriteSheetFrame {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}
export interface ComposeCenteredVerticalSpriteSheetDependencies {
  decode(image: Uint8Array, index: number): Promise<DecodedSpriteSheetFrame>
}
export function composeCenteredVerticalSpriteSheet(
  frames: readonly CenteredSpriteSheetFrame[],
  dependencies?: ComposeCenteredVerticalSpriteSheetDependencies,
): Promise<Uint8Array> {
  return composeVerticalSheet(
    frames,
    nativeRasterBackend,
    dependencies
      ? async (image, index) => {
          const decoded = await dependencies.decode(image, index)
          return { width: decoded.width, height: decoded.height, pixels: decoded.data }
        }
      : undefined,
  )
}
