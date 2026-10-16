import type { ExactImageSize } from "../../application/ports/image-operations.ts"
import { nativeImageOperations } from "./native-image-operations.ts"

export type { ExactImageSize } from "../../application/ports/image-operations.ts"
export function resizeImageExact(image: Uint8Array, size: ExactImageSize): Promise<Uint8Array> {
  return nativeImageOperations.resizeExact(image, size)
}
