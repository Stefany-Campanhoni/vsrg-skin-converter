import type { ImageAsset } from "../../domain/image.ts"
import { nativeImageOperations } from "./native-image-operations.ts"
export async function extractImageFrame(
  asset: Pick<ImageAsset, "filePath" | "frame">,
): Promise<string | Uint8Array> {
  const result = await nativeImageOperations.extractFrame(asset)
  return asset.frame ? result : asset.filePath
}
