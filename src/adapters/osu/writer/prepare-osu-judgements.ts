import type { JudgementImageVariants } from "../../../application/ports/image-operations.ts"
import type { ImageAsset } from "../../../domain/image.ts"
import { type JudgementSet, judgementGrades } from "../../../domain/judgement.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"

export type JudgementRenderer = (
  definition: ImageAsset,
  sourceDensity: 1 | 2,
  scale: number,
) => Promise<JudgementImageVariants>
export type JudgementWriter = (filePath: string, buffer: Uint8Array) => Promise<void>

export interface PrepareOsuJudgementsOptions {
  judgements: JudgementSet
  scale: number
  render: JudgementRenderer
}

export async function prepareOsuJudgements(
  options: PrepareOsuJudgementsOptions,
): Promise<
  readonly { grade: (typeof judgementGrades)[number]; variants: JudgementImageVariants }[]
> {
  const render = options.render
  const completeJudgements = judgementGrades.map((grade) => {
    const image = options.judgements.images[grade]
    if (!image) {
      throw new Error(`Missing ${grade} judgement required for osu output`)
    }
    return { grade, image }
  })
  const prepared = await settleAll(
    completeJudgements.map(({ grade, image }) =>
      invokeAsPromise(async () => ({
        grade,
        variants: await render(image, options.judgements.sourceDensity, options.scale),
      })),
    ),
  )

  return prepared
}
