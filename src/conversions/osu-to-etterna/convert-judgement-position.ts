import { gameDefaults } from "../../config/game-defaults.ts"

export function getEtternaJudgementPosition(osuJudgementPosition: number): number {
  return (
    Math.round(osuJudgementPosition) -
    gameDefaults.osu.judgementPosition +
    gameDefaults.etterna.judgementPosition
  )
}
