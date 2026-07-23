import sharp from "sharp"
import type { ImageAsset } from "../../domain/image.ts"

export interface RenderReceptorOptions {
  hitPosition: number
  referenceHitPosition: number
  baseImagePath: string
}

const maximumReceptorSize = 150
const pixelsPerHitPositionPoint = 3

export function getReceptorCanvasHeight(
  hitPosition: number,
  baseHeight: number,
  receptorHeight: number,
  referenceHitPosition: number,
): number {
  const adjustedHeight =
    baseHeight + (referenceHitPosition - hitPosition) * pixelsPerHitPositionPoint
  return Math.max(receptorHeight, Math.round(adjustedHeight))
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

  const renderedReceptor = await sharp(receptorInput)
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
  const receptorMetadata = await sharp(renderedReceptor).metadata()
  if (!receptorMetadata.width || !receptorMetadata.height) {
    throw new Error(`Could not render receptor ${definition.filePath}`)
  }

  const canvasHeight = getReceptorCanvasHeight(
    options.hitPosition,
    baseMetadata.height,
    receptorMetadata.height,
    options.referenceHitPosition,
  )
  const left = Math.floor((baseMetadata.width - receptorMetadata.width) / 2)

  return sharp({
    create: {
      width: baseMetadata.width,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: renderedReceptor, left, top: 0 }])
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

async function extractImageFrame(
  definition: Pick<ImageAsset, "filePath" | "frame">,
): Promise<string | Buffer> {
  const sourceMetadata = await sharp(definition.filePath).metadata()
  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error(`Could not read image dimensions from ${definition.filePath}`)
  }

  if (!definition.frame) {
    return definition.filePath
  }

  const { index, columns, rows } = definition.frame
  const frameCount = columns * rows
  if (
    columns < 1 ||
    rows < 1 ||
    index < 0 ||
    index >= frameCount ||
    sourceMetadata.width % columns !== 0 ||
    sourceMetadata.height % rows !== 0
  ) {
    throw new Error(`Invalid spritesheet frame for ${definition.filePath}`)
  }

  const frameWidth = sourceMetadata.width / columns
  const frameHeight = sourceMetadata.height / rows
  return sharp(definition.filePath)
    .extract({
      left: (index % columns) * frameWidth,
      top: Math.floor(index / columns) * frameHeight,
      width: frameWidth,
      height: frameHeight,
    })
    .png()
    .toBuffer()
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360
}
