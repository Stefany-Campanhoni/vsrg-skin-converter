const receptorCalibration = {
  unstretchedColumnWidth: 46,
  calibratedColumnWidth: 62,
  calibratedVerticalScale: 196 / 146,
  logicalVerticalOffset: 23,
  normalizationSize: 150,
} as const

export function getOsuReceptorVerticalScale(columnWidth: number): number {
  const slope =
    (receptorCalibration.calibratedVerticalScale - 1) /
    (receptorCalibration.calibratedColumnWidth - receptorCalibration.unstretchedColumnWidth)
  const verticalScale = 1 + (columnWidth - receptorCalibration.unstretchedColumnWidth) * slope

  if (!Number.isFinite(verticalScale) || verticalScale <= 0) {
    throw new Error(`osu receptor vertical scale must be positive for column width ${columnWidth}`)
  }

  return verticalScale
}

export function getOsuReceptorLogicalVerticalOffset(): number {
  return receptorCalibration.logicalVerticalOffset
}

export function getOsuReceptorNormalizationSize(): number {
  return receptorCalibration.normalizationSize
}
