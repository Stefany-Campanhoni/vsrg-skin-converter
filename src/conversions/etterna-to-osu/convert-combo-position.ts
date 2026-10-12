import { etternaOsuPlayfieldReference as gameDefaults } from "../etterna-osu-playfield-reference.ts"

const osuComboPositionCalibrationOffset = -1

export function getComboPosition(etternaComboPosition: number): number {
  const convertedPosition = Math.round(
    etternaComboPosition - gameDefaults.etterna.comboPosition + gameDefaults.osu.comboPosition,
  )

  return convertedPosition + osuComboPositionCalibrationOffset
}
