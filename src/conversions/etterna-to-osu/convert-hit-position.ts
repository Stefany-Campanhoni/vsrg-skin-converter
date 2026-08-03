import { gameDefaults } from "../../config/game-defaults.ts"

const osuHitPositionCalibrationOffset = 1

export function getHitPosition(etternaHitPosition: number): number {
  const convertedPosition = Math.round(
    etternaHitPosition - gameDefaults.etterna.hitPosition + gameDefaults.osu.hitPosition,
  )

  return convertedPosition + osuHitPositionCalibrationOffset
}
