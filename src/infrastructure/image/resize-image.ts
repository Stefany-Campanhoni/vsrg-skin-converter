import { nativeImageOperations } from "./native-image-operations.ts"
export function resizeImageProportionally(image: Uint8Array, scale: number): Promise<Uint8Array> {
  return nativeImageOperations.resizeProportionally(image, scale)
}
