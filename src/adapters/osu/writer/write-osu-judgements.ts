import { mkdir } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset } from "../../../domain/image.ts"
import { type JudgementSet, judgementGrades } from "../../../domain/judgement.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { writeFileContents } from "../../../infrastructure/filesystem/bun-file.ts"
import {
  type JudgementImageVariants,
  renderJudgementImageVariants,
} from "../../../infrastructure/image/sharp-judgement-processor.ts"

export type JudgementRenderer = (
  definition: ImageAsset,
  sourceDensity: 1 | 2,
  scale: number,
) => Promise<JudgementImageVariants>
export type JudgementWriter = (filePath: string, buffer: Uint8Array) => Promise<void>

export interface WriteOsuJudgementsOptions {
  judgements: JudgementSet
  outputDirectory: string
  scale: number
  render?: JudgementRenderer
  write?: JudgementWriter
}

export async function writeOsuJudgements(options: WriteOsuJudgementsOptions): Promise<void> {
  const render = options.render ?? renderJudgementImageVariants
  const write = options.write ?? writeFileContents
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
