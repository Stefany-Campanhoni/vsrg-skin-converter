import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset } from "../../../domain/image.ts"
import { type JudgementSet, judgementGrades } from "../../../domain/judgement.ts"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  type JudgementImageVariants,
  renderJudgementImageVariants,
} from "../../../infrastructure/image/sharp-judgement-processor.ts"

export type JudgementRenderer = (
  definition: ImageAsset,
  sourceDensity: 1 | 2,
) => Promise<JudgementImageVariants>
export type JudgementWriter = (filePath: string, buffer: Buffer) => Promise<void>

export interface WriteOsuJudgementsOptions {
  judgements: JudgementSet
  outputDirectory: string
  render?: JudgementRenderer
  write?: JudgementWriter
}

export async function writeOsuJudgements(options: WriteOsuJudgementsOptions): Promise<void> {
  const render = options.render ?? renderJudgementImageVariants
  const write = options.write ?? writeFile
  const prepared = await settleAll(
    judgementGrades.map(async (grade) => ({
      grade,
      variants: await render(options.judgements.images[grade], options.judgements.sourceDensity),
    })),
  )

  const outputDirectory = path.join(options.outputDirectory, "mania", "judgements")
  await mkdir(outputDirectory, { recursive: true })
  await settleAll(
    prepared.flatMap(({ grade, variants }) => [
      Promise.resolve().then(() =>
        write(path.join(outputDirectory, `${grade}.png`), variants.standardResolution),
      ),
      Promise.resolve().then(() =>
        write(path.join(outputDirectory, `${grade}@2x.png`), variants.doubleResolution),
      ),
    ]),
  )
}
