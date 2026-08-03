import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset } from "../../../domain/image.ts"
import { type JudgementSet, judgementGrades } from "../../../domain/judgement.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  type JudgementImageVariants,
  renderJudgementImageVariants,
} from "../../../infrastructure/image/sharp-judgement-processor.ts"

export type JudgementRenderer = (
  definition: ImageAsset,
  sourceDensity: 1 | 2,
  scale: number,
) => Promise<JudgementImageVariants>
export type JudgementWriter = (filePath: string, buffer: Buffer) => Promise<void>

export interface WriteOsuJudgementsOptions {
  judgements: JudgementSet
  outputDirectory: string
  scale: number
  render?: JudgementRenderer
  write?: JudgementWriter
}

export async function writeOsuJudgements(options: WriteOsuJudgementsOptions): Promise<void> {
  const render = options.render ?? renderJudgementImageVariants
  const write = options.write ?? writeFile
  const prepared = await settleAll(
    judgementGrades.map((grade) =>
      invokeAsPromise(async () => ({
        grade,
        variants: await render(
          options.judgements.images[grade],
          options.judgements.sourceDensity,
          options.scale,
        ),
      })),
    ),
  )

  const outputDirectory = path.join(options.outputDirectory, "mania", "judgements")
  await mkdir(outputDirectory, { recursive: true })
  await settleAll(
    prepared.flatMap(({ grade, variants }) => [
      invokeAsPromise(() =>
        write(path.join(outputDirectory, `${grade}.png`), variants.standardResolution),
      ),
      invokeAsPromise(() =>
        write(path.join(outputDirectory, `${grade}@2x.png`), variants.doubleResolution),
      ),
    ]),
  )
}
