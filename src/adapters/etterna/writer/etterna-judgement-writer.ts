import type { ImageAsset } from "../../../domain/image.ts"
import type { JudgementSet } from "../../../domain/judgement.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { writeFileContents } from "../../../infrastructure/filesystem/bun-file.ts"
import {
  type CenteredSpriteSheetFrame,
  composeCenteredVerticalSpriteSheet,
} from "../../../infrastructure/image/compose-centered-vertical-sprite-sheet.ts"
import {
  type JudgementImageVariants,
  renderJudgementImageVariants,
} from "../../../infrastructure/image/sharp-judgement-processor.ts"
import { analyzeEtternaJudgementSheet } from "../judgements/analyze-etterna-judgement-sheet.ts"
import { renderEtternaJudgementSheet } from "./render-etterna-judgement-sheet.ts"

export interface EtternaJudgementWriterDependencies {
  analyzeDefaultJudgements(filePath: string): Promise<JudgementSet>
  render(
    definition: ImageAsset,
    sourceDensity: 1 | 2,
    scale: number,
  ): Promise<JudgementImageVariants>
  compose(frames: readonly CenteredSpriteSheetFrame[]): Promise<Uint8Array>
  writeFile(filePath: string, data: Uint8Array): Promise<void>
}

const defaultDependencies: EtternaJudgementWriterDependencies = {
  analyzeDefaultJudgements: analyzeEtternaJudgementSheet,
  render: renderJudgementImageVariants,
  compose: composeCenteredVerticalSpriteSheet,
  writeFile: writeFileContents,
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
    const sheet = await renderEtternaJudgementSheet(
      skin,
      this.#defaultSheetPath,
      this.#dependencies,
    )
    try {
      await this.#dependencies.writeFile(outputFile, sheet)
    } catch (cause) {
      throw new Error(`Could not write Etterna judgement sprite sheet to ${outputFile}`, { cause })
    }
  }
}
