import type { ImageAsset } from "../../domain/image.ts"
export interface ImageDimensions {
  readonly width: number
  readonly height: number
}
export type ExactImageSize = ImageDimensions
export interface RenderReceptorOptions {
  hitPosition: number
  referenceHitPosition: number
  pixelsPerHitPositionPoint: number
  verticalScale: number
  logicalCanvasHeight: number
  pixelsPerLogicalPoint: number
  logicalBottomOffset: number
  normalizationSize: number
  baseImagePath: string
}
export interface JudgementImageVariants {
  standardResolution: Uint8Array
  doubleResolution: Uint8Array
}
export interface CenteredSpriteSheetFrame {
  readonly label: string
  readonly image: Uint8Array
}
export interface ImageOperations {
  dimensions(image: Uint8Array): Promise<ImageDimensions>
  extractFrame(asset: Pick<ImageAsset, "filePath" | "frame">): Promise<Uint8Array>
  renderNote(asset: ImageAsset): Promise<Uint8Array>
  renderReceptor(asset: ImageAsset, options: RenderReceptorOptions): Promise<Uint8Array>
  renderJudgementVariants(
    asset: ImageAsset,
    density: 1 | 2,
    scale: number,
  ): Promise<JudgementImageVariants>
  resizeProportionally(image: Uint8Array, scale: number): Promise<Uint8Array>
  resizeToWidth(image: Uint8Array, width: number): Promise<Uint8Array>
  resizeExact(image: Uint8Array, size: ExactImageSize): Promise<Uint8Array>
  normalizeReceptor(image: Uint8Array, size: ImageDimensions): Promise<Uint8Array>
  isTransparent(image: Uint8Array): Promise<boolean>
  composeVerticalSheet(frames: readonly CenteredSpriteSheetFrame[]): Promise<Uint8Array>
}
