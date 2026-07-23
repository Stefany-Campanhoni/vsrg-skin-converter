const receptorStretchCalibration = {
  unstretchedColumnWidth: 46,
  calibratedColumnWidth: 62,
  calibratedVerticalScale: 200 / 146,
} as const

export function getOsuReceptorVerticalScale(columnWidth: number): number {
  const slope =
    (receptorStretchCalibration.calibratedVerticalScale - 1) /
    (receptorStretchCalibration.calibratedColumnWidth -
      receptorStretchCalibration.unstretchedColumnWidth)
  const verticalScale =
    1 + (columnWidth - receptorStretchCalibration.unstretchedColumnWidth) * slope

  if (!Number.isFinite(verticalScale) || verticalScale <= 0) {
    throw new Error(`osu receptor vertical scale must be positive for column width ${columnWidth}`)
  }

  return verticalScale
}
