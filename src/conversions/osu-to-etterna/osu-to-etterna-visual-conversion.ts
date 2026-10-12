import type { VisualSkinConversion } from "../../application/conversion/visual-conversion-registry.ts"
import type { VisualPlayfieldConfiguration, VisualSkinModel } from "../../domain/visual-skin.ts"
import { getEtternaComboPosition } from "./convert-combo-position.ts"
import { getEtternaHitPosition } from "./convert-hit-position.ts"
import { getEtternaJudgementPosition } from "./convert-judgement-position.ts"
import { getEtternaReceptorSize } from "./convert-receptor-size.ts"
export function convertOsuVisualPlayfield(
  source: VisualPlayfieldConfiguration,
): VisualPlayfieldConfiguration {
  return {
    hitPosition: getEtternaHitPosition(source.hitPosition),
    judgementPosition: getEtternaJudgementPosition(source.judgementPosition),
    comboPosition: getEtternaComboPosition(source.comboPosition),
    columnWidth: getEtternaReceptorSize(source.columnWidth),
    comboScale: source.comboScale,
    judgementScale: source.judgementScale,
    ...(source.isDownscroll === undefined ? {} : { isDownscroll: source.isDownscroll }),
  }
}
export class OsuToEtternaVisualConversion implements VisualSkinConversion {
  readonly source = "osu"
  readonly target = "etterna"
  async convert(source: VisualSkinModel): Promise<VisualSkinModel> {
    if (source.game !== this.source)
      throw new Error(`osu to Etterna conversion cannot convert a ${source.game} skin`)
    for (const key of [
      "hitPosition",
      "judgementPosition",
      "comboPosition",
      "columnWidth",
      "comboScale",
      "judgementScale",
    ] as const) {
      if (!Number.isFinite(source.playfield[key]))
        throw new Error(`Visual conversion requires a finite ${key}`)
    }
    return { ...source, game: this.target, playfield: convertOsuVisualPlayfield(source.playfield) }
  }
}
