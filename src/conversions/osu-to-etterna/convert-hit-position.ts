import { gameDefaults } from "../../config/game-defaults.ts"

const osuHitPositionCalibrationOffset = 1

export function getEtternaHitPosition(osuHitPosition: number): number {
  const osuHitPositionBaseline = gameDefaults.osu.hitPosition + osuHitPositionCalibrationOffset

  return Math.round(osuHitPosition) - osuHitPositionBaseline + gameDefaults.etterna.hitPosition
}
