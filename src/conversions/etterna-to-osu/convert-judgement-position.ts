import { etternaOsuPlayfieldReference as gameDefaults } from "../etterna-osu-playfield-reference.ts"

export function getJudgementPosition(etternaJudgementPosition: number): number {
  return Math.round(
    etternaJudgementPosition -
      gameDefaults.etterna.judgementPosition +
      gameDefaults.osu.judgementPosition,
  )
}
