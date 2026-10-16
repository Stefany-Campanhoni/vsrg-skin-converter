import { nativeImageOperations } from "./native-image-operations.ts"
export function resizeImageToWidth(image: Uint8Array, width: number): Promise<Uint8Array> {
  return nativeImageOperations.resizeToWidth(image, width)
}
