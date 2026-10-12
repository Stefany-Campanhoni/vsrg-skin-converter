import { nativeImageOperations } from "./native-image-operations.ts"
export function isImageFullyTransparent(image: Uint8Array): Promise<boolean> {
  return nativeImageOperations.isTransparent(image)
}
