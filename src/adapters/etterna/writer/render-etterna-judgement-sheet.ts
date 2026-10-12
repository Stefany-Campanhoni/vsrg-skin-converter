import type {
  CenteredSpriteSheetFrame,
  JudgementImageVariants,
} from "../../../application/ports/image-operations.ts"
import type { ImageAsset } from "../../../domain/image.ts"
import type { JudgementSet } from "../../../domain/judgement.ts"
import { judgementGrades } from "../../../domain/judgement.ts"
import type { VisualSkinModel } from "../../../domain/visual-skin.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"

export interface EtternaJudgementWriterDependencies {
  analyzeDefaultJudgements(filePath: string): Promise<JudgementSet>
  render(
    definition: ImageAsset,
    sourceDensity: 1 | 2,
    scale: number,
  ): Promise<JudgementImageVariants>
  compose(frames: readonly CenteredSpriteSheetFrame[]): Promise<Uint8Array>
}

export async function renderEtternaJudgementSheet(
  skin: VisualSkinModel,
  defaultSheetPath: string,
  dependencies: EtternaJudgementWriterDependencies,
): Promise<Uint8Array> {
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
      defaults = await dependencies.analyzeDefaultJudgements(defaultSheetPath)
    } catch (cause) {
      throw new Error(`Could not analyze default Etterna judgement sheet ${defaultSheetPath}`, {
        cause,
      })
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
          const variants = await dependencies.render(definition, sourceDensity, 1)
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

  let sheet: Uint8Array
  try {
    sheet = await dependencies.compose(frames)
  } catch (cause) {
    throw new Error("Could not compose Etterna judgement sprite sheet", { cause })
  }

  return sheet
}
