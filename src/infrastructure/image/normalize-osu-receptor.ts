import type { ImageDimensions } from "../../application/ports/image-operations.ts"
import { nativeImageOperations } from "./native-image-operations.ts"

export type { ImageDimensions } from "../../application/ports/image-operations.ts"
export function normalizeOsuReceptorImage(
  image: Uint8Array,
  size: ImageDimensions,
): Promise<Uint8Array> {
  return nativeImageOperations.normalizeReceptor(image, size)
}
