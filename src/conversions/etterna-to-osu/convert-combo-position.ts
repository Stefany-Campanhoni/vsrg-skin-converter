import { gameDefaults } from "../../config/game-defaults.ts"

export function getComboPosition(etternaComboPosition: number): number {
  return Math.round(
    etternaComboPosition - gameDefaults.etterna.comboPosition + gameDefaults.osu.comboPosition,
  )
}
