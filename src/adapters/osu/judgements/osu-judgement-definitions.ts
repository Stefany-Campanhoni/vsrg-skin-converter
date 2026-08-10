import type { JudgementGrade } from "../../../domain/judgement.ts"

interface OsuJudgementDefinition {
  readonly property: string
  readonly defaultFileName: string
}

export const osuJudgementDefinitions = {
  marvelous: { property: "hit300g", defaultFileName: "mania-hit300g" },
  perfect: { property: "hit300", defaultFileName: "mania-hit300" },
  great: { property: "hit200", defaultFileName: "mania-hit200" },
  good: { property: "hit100", defaultFileName: "mania-hit100" },
  bad: { property: "hit50", defaultFileName: "mania-hit50" },
  miss: { property: "hit0", defaultFileName: "mania-hit0" },
} as const satisfies Readonly<Record<JudgementGrade, OsuJudgementDefinition>>
