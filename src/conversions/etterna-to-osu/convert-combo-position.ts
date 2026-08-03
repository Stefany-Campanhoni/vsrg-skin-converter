import { gameDefaults } from "../../config/game-defaults.ts"

const osuComboPositionCalibrationOffset = -1

export function getComboPosition(etternaComboPosition: number): number {
  const convertedPosition = Math.round(
    etternaComboPosition - gameDefaults.etterna.comboPosition + gameDefaults.osu.comboPosition,
  )

  return convertedPosition + osuComboPositionCalibrationOffset
}
