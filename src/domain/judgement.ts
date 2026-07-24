import type { ImageAsset } from "./image.ts"

export const judgementGrades = ["marvelous", "perfect", "great", "good", "bad", "miss"] as const

export type JudgementGrade = (typeof judgementGrades)[number]

export interface JudgementSet {
  sourceDensity: 1 | 2
  images: Record<JudgementGrade, ImageAsset>
}
