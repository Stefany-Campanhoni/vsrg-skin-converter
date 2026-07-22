import type { SupportedGame } from "../constants/game.ts"

export function getHitPosition(
  source: SupportedGame,
  target: SupportedGame,
  value: number,
): number {
  if (source === target) return value

  if (source === "etterna" && target === "osu") {
    return value + 438
  }

  return value - 438
}
