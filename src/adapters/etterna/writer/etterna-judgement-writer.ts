import { readFile, writeFile } from "node:fs/promises"
import { judgementGrades } from "../../../domain/judgement.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  type CenteredSpriteSheetFrame,
  composeCenteredVerticalSpriteSheet,
} from "../../../infrastructure/image/compose-centered-vertical-sprite-sheet.ts"

export interface EtternaJudgementWriterDependencies {
  readFile(filePath: string): Promise<Buffer>
  compose(frames: readonly CenteredSpriteSheetFrame[]): Promise<Buffer>
  writeFile(filePath: string, data: Buffer): Promise<void>
}

const defaultDependencies: EtternaJudgementWriterDependencies = {
  readFile,
  compose: composeCenteredVerticalSpriteSheet,
  writeFile,
}

export class EtternaJudgementWriter {
  readonly #dependencies: EtternaJudgementWriterDependencies

  constructor(dependencies: EtternaJudgementWriterDependencies = defaultDependencies) {
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

    const frames = await settleAll(
      judgementGrades.map((grade) => {
        const source = judgements.images[grade].filePath
        return invokeAsPromise(async () => {
          try {
            return { label: grade, image: await this.#dependencies.readFile(source) }
          } catch (cause) {
            throw new Error(`Could not read Etterna judgement ${grade} from ${source}`, { cause })
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
