import { writeFile } from "node:fs/promises"
import type { ImageAsset } from "../../../domain/image.ts"
import type { JudgementSet } from "../../../domain/judgement.ts"
import { judgementGrades } from "../../../domain/judgement.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  type CenteredSpriteSheetFrame,
  composeCenteredVerticalSpriteSheet,
} from "../../../infrastructure/image/compose-centered-vertical-sprite-sheet.ts"
import {
  type JudgementImageVariants,
  renderJudgementImageVariants,
} from "../../../infrastructure/image/sharp-judgement-processor.ts"
import { analyzeEtternaJudgementSheet } from "../judgements/analyze-etterna-judgement-sheet.ts"

export interface EtternaJudgementWriterDependencies {
  analyzeDefaultJudgements(filePath: string): Promise<JudgementSet>
  render(
    definition: ImageAsset,
    sourceDensity: 1 | 2,
    scale: number,
  ): Promise<JudgementImageVariants>
  compose(frames: readonly CenteredSpriteSheetFrame[]): Promise<Buffer>
  writeFile(filePath: string, data: Buffer): Promise<void>
}

const defaultDependencies: EtternaJudgementWriterDependencies = {
  analyzeDefaultJudgements: analyzeEtternaJudgementSheet,
  render: renderJudgementImageVariants,
  compose: composeCenteredVerticalSpriteSheet,
  writeFile,
}

export class EtternaJudgementWriter {
  readonly #defaultSheetPath: string
  readonly #dependencies: EtternaJudgementWriterDependencies

  constructor(
    defaultSheetPath: string,
    dependencies: EtternaJudgementWriterDependencies = defaultDependencies,
  ) {
    this.#defaultSheetPath = defaultSheetPath
    this.#dependencies = dependencies
  }

  async writeJudgement(skin: SkinModel, outputFile: string): Promise<void> {
    if (skin.game !== "etterna") {
      throw new Error(`Etterna judgement writer cannot write a ${skin.game} skin`)
    }
    const judgements = skin.assets.judgements
    if (!judgements) {
      throw new Error("Etterna skin model does not contain judgements")
    }

    let defaults: JudgementSet | undefined
    if (judgementGrades.some((grade) => !judgements.images[grade])) {
      try {
        defaults = await this.#dependencies.analyzeDefaultJudgements(this.#defaultSheetPath)
      } catch (cause) {
        throw new Error(
          `Could not analyze default Etterna judgement sheet ${this.#defaultSheetPath}`,
          { cause },
        )
      }
    }

    const definitions = judgementGrades.map((grade) => {
      const custom = judgements.images[grade]
      const definition = custom ?? defaults?.images[grade]
      if (!definition) {
        throw new Error(`Default Etterna judgement sheet does not contain ${grade}`)
      }
      const sourceDensity = custom ? judgements.sourceDensity : defaults?.sourceDensity
      if (!sourceDensity) {
        throw new Error(`Missing Etterna judgement source density for ${grade}`)
      }
      return { grade, definition, sourceDensity }
    })

    const frames = await settleAll(
      definitions.map(({ grade, definition, sourceDensity }) => {
        return invokeAsPromise(async () => {
          try {
            const variants = await this.#dependencies.render(definition, sourceDensity, 1)
            return {
              label: grade,
              image:
                judgements.sourceDensity === 2
                  ? variants.doubleResolution
                  : variants.standardResolution,
            }
          } catch (cause) {
            throw new Error(
              `Could not render Etterna judgement ${grade} from ${definition.filePath}`,
              { cause },
            )
          }
        })
      }),
    )

    let sheet: Buffer
    try {
      sheet = await this.#dependencies.compose(frames)
    } catch (cause) {
      throw new Error("Could not compose Etterna judgement sprite sheet", { cause })
    }

    try {
      await this.#dependencies.writeFile(outputFile, sheet)
    } catch (cause) {
      throw new Error(`Could not write Etterna judgement sprite sheet to ${outputFile}`, { cause })
    }
  }
}
