import type { ImageDimensions } from "../../application/ports/image-operations.ts"
export interface RgbaImage extends ImageDimensions {
  readonly pixels: Uint8Array
}
export interface RasterRectangle extends ImageDimensions {
  readonly left: number
  readonly top: number
}
export interface RasterResize {
  readonly width?: number
  readonly height?: number
  readonly fit: "fill" | "inside"
  readonly withoutEnlargement: boolean
  readonly kernel: "lanczos3"
}
export interface RasterOverlay {
  readonly image: Uint8Array
  readonly raw?: ImageDimensions
  readonly left: number
  readonly top: number
}
export interface RasterBackend {
  dimensions(image: Uint8Array): Promise<ImageDimensions>
  ensureAlpha(image: Uint8Array): Promise<Uint8Array>
  extract(image: Uint8Array, rectangle: RasterRectangle): Promise<Uint8Array>
  rotate(image: Uint8Array, angle: number): Promise<Uint8Array>
  resize(image: Uint8Array, options: RasterResize): Promise<Uint8Array>
  affineVertical(image: Uint8Array, scale: number): Promise<Uint8Array>
  decodeRgba(image: Uint8Array): Promise<RgbaImage>
  compose(width: number, height: number, overlays: readonly RasterOverlay[]): Promise<Uint8Array>
  dispose(): Promise<void>
}
