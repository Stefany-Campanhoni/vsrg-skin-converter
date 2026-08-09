import { gameDefaults } from "../../config/game-defaults.ts"

const osuComboPositionCalibrationOffset = -1

export function getEtternaComboPosition(osuComboPosition: number): number {
  const osuComboPositionBaseline =
    gameDefaults.osu.comboPosition + osuComboPositionCalibrationOffset

  return (
    Math.round(osuComboPosition) - osuComboPositionBaseline + gameDefaults.etterna.comboPosition
  )
}
