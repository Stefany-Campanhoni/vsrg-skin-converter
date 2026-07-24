import { gameDefaults } from "../../config/game-defaults.ts"

export function getJudgementPosition(etternaJudgementPosition: number): number {
  return Math.round(
    etternaJudgementPosition -
      gameDefaults.etterna.judgementPosition +
      gameDefaults.osu.judgementPosition,
  )
}
