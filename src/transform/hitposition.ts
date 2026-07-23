import { gamesDefault } from "../templates/basis.ts"

export function getHitPosition(etternaHitPosition: number): number {
  return Math.round(
    etternaHitPosition - gamesDefault.etterna.hitposition + gamesDefault.osu.hitposition,
  )
}
