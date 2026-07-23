import { gameDefaults } from "../../config/game-defaults.ts"

export function getHitPosition(etternaHitPosition: number): number {
  return Math.round(
    etternaHitPosition - gameDefaults.etterna.hitPosition + gameDefaults.osu.hitPosition,
  )
}
