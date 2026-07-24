import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"
import { extractImageFrame } from "./extract-image-frame.ts"

export interface RenderReceptorOptions {
  hitPosition: number
  referenceHitPosition: number
  pixelsPerHitPositionPoint: number
  verticalScale: number
  logicalCanvasHeight: number
  renderedWidth: number
  logicalBottomOffset: number
  baseImagePath: string
}

const maximumReceptorSize = 150

export function getReceptorBottomPadding(
  hitPosition: number,
  logicalCanvasHeight: number,
  canvasWidth: number,
  renderedWidth: number,
  logicalBottomOffset: number,
): number {
  if (
    !Number.isFinite(hitPosition) ||
    !Number.isFinite(logicalCanvasHeight) ||
    !Number.isFinite(canvasWidth) ||
    !Number.isFinite(renderedWidth) ||
    !Number.isFinite(logicalBottomOffset) ||
    logicalCanvasHeight <= 0 ||
    canvasWidth <= 0 ||
    renderedWidth <= 0
  ) {
    throw new Error("Receptor footer dimensions must be finite and positive")
  }

  if (hitPosition < 0 || hitPosition > logicalCanvasHeight) {
    throw new Error(`Receptor hit position must be between 0 and ${logicalCanvasHeight}`)
  }

  const logicalBottomGap = logicalCanvasHeight - hitPosition + logicalBottomOffset
  if (logicalBottomGap < 0) {
    throw new Error("Receptor logical bottom gap must be non-negative")
  }

  return Math.round((logicalBottomGap * canvasWidth) / renderedWidth)
}

export function getReceptorCanvasHeight(
  hitPosition: number,
  baseHeight: number,
  receptorHeight: number,
  referenceHitPosition: number,
  pixelsPerHitPositionPoint: number,
  bottomPadding: number,
): number {
  const adjustedHeight =
    baseHeight + (referenceHitPosition - hitPosition) * pixelsPerHitPositionPoint
  return Math.max(receptorHeight + bottomPadding, Math.round(adjustedHeight))
}

export async function renderReceptorImage(
  definition: ImageAsset,
  options: RenderReceptorOptions,
): Promise<Buffer> {
  const baseMetadata = await sharp(options.baseImagePath).metadata()
  if (!baseMetadata.width || !baseMetadata.height) {
    throw new Error(`Could not read receptor base dimensions from ${options.baseImagePath}`)
  }

  const receptorInput = await extractImageFrame(definition)

  const normalizedReceptor = await sharp(receptorInput)
    .rotate(normalizeRotation(definition.rotation))
    .resize({
      width: maximumReceptorSize,
      height: maximumReceptorSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .png()
    .toBuffer()
  const normalizedMetadata = await sharp(normalizedReceptor).metadata()
  if (!normalizedMetadata.width || !normalizedMetadata.height) {
    throw new Error(`Could not render receptor ${definition.filePath}`)
  }

  const stretchedReceptor = await sharp(normalizedReceptor)
    .affine([1, 0, 0, options.verticalScale], {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      interpolator: sharp.interpolators.bicubic,
    })
    .ensureAlpha()
    .png()
    .toBuffer()
  const visibleReceptor = await removeTrailingTransparentRows(
    stretchedReceptor,
    definition.filePath,
  )
  const receptorMetadata = await sharp(visibleReceptor).metadata()
  if (!receptorMetadata.width || !receptorMetadata.height) {
    throw new Error(`Could not render receptor ${definition.filePath}`)
  }

  const bottomPadding = getReceptorBottomPadding(
    options.hitPosition,
    options.logicalCanvasHeight,
    baseMetadata.width,
    options.renderedWidth,
    options.logicalBottomOffset,
  )
  const canvasHeight = getReceptorCanvasHeight(
    options.hitPosition,
    baseMetadata.height,
    receptorMetadata.height,
    options.referenceHitPosition,
    options.pixelsPerHitPositionPoint,
    bottomPadding,
  )
  const left = Math.floor((baseMetadata.width - receptorMetadata.width) / 2)
  const top = canvasHeight - bottomPadding - receptorMetadata.height

  return sharp({
    create: {
      width: baseMetadata.width,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: visibleReceptor, left, top }])
    .png()
    .toBuffer()
}

export async function renderNoteImage(definition: ImageAsset): Promise<Buffer> {
  const noteInput = await extractImageFrame(definition)

  return sharp(noteInput)
    .rotate(normalizeRotation(definition.rotation))
    .ensureAlpha()
    .png()
    .toBuffer()
}

async function removeTrailingTransparentRows(image: Buffer, filePath: string): Promise<Buffer> {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true })
  let lastVisibleRow = -1

  for (let y = info.height - 1; y >= 0 && lastVisibleRow < 0; y -= 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alphaOffset = (y * info.width + x) * info.channels + (info.channels - 1)
      if (data[alphaOffset] !== 0) {
        lastVisibleRow = y
        break
      }
    }
  }

  if (lastVisibleRow < 0) {
    throw new Error(`Rendered receptor ${filePath} contains no visible pixels`)
  }

  if (lastVisibleRow === info.height - 1) {
    return image
  }

  return sharp(image)
    .extract({
      left: 0,
      top: 0,
      width: info.width,
      height: lastVisibleRow + 1,
    })
    .png()
    .toBuffer()
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360
}
