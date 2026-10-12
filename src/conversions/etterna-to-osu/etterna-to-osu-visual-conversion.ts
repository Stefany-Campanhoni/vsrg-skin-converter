import type { VisualSkinConversion } from "../../application/conversion/visual-conversion-registry.ts"
import type { VisualPlayfieldConfiguration, VisualSkinModel } from "../../domain/visual-skin.ts"
import { getColumnWidth } from "./convert-column-width.ts"
import { getComboPosition } from "./convert-combo-position.ts"
import { getHitPosition } from "./convert-hit-position.ts"
import { getJudgementPosition } from "./convert-judgement-position.ts"
export function convertEtternaVisualPlayfield(
  source: VisualPlayfieldConfiguration,
): VisualPlayfieldConfiguration {
  return {
    hitPosition: getHitPosition(source.hitPosition),
    judgementPosition: getJudgementPosition(source.judgementPosition),
    comboPosition: getComboPosition(source.comboPosition),
    columnWidth: getColumnWidth(source.columnWidth),
    comboScale: source.comboScale,
    judgementScale: source.judgementScale,
    ...(source.isDownscroll === undefined ? {} : { isDownscroll: source.isDownscroll }),
  }
}
export class EtternaToOsuVisualConversion implements VisualSkinConversion {
  readonly source = "etterna"
  readonly target = "osu"
  async convert(source: VisualSkinModel): Promise<VisualSkinModel> {
    if (source.game !== this.source)
      throw new Error(`Etterna to osu conversion cannot convert a ${source.game} skin`)
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
    return {
      ...source,
      game: this.target,
      playfield: convertEtternaVisualPlayfield(source.playfield),
    }
  }
}
