export function getReceptorBottomPadding(
  hitPosition: number,
  logicalCanvasHeight: number,
  pixelsPerLogicalPoint: number,
  logicalBottomOffset: number,
): number {
  if (
    !Number.isFinite(hitPosition) ||
    !Number.isFinite(logicalCanvasHeight) ||
    !Number.isFinite(pixelsPerLogicalPoint) ||
    !Number.isFinite(logicalBottomOffset) ||
    logicalCanvasHeight <= 0 ||
    pixelsPerLogicalPoint <= 0
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

  return Math.round(logicalBottomGap * pixelsPerLogicalPoint)
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
