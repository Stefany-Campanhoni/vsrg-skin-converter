import type { RenderReceptorOptions } from "../../application/ports/image-operations.ts"
import type { ImageAsset } from "../../domain/image.ts"
import { nativeImageOperations } from "./native-image-operations.ts"

export type { RenderReceptorOptions } from "../../application/ports/image-operations.ts"
export { getReceptorBottomPadding, getReceptorCanvasHeight } from "./receptor-geometry.ts"
export function renderReceptorImage(
  asset: ImageAsset,
  options: RenderReceptorOptions,
): Promise<Uint8Array> {
  return nativeImageOperations.renderReceptor(asset, options)
}
export function renderNoteImage(asset: ImageAsset): Promise<Uint8Array> {
  return nativeImageOperations.renderNote(asset)
}
