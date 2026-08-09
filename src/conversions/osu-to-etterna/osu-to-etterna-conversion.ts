import type { SkinConversion } from "../../application/conversion/conversion-registry.ts"
import type { SkinModel } from "../../domain/skin.ts"
import { getEtternaComboPosition } from "./convert-combo-position.ts"
import { getEtternaHitPosition } from "./convert-hit-position.ts"
import { getEtternaJudgementPosition } from "./convert-judgement-position.ts"
import { getEtternaReceptorSize } from "./convert-receptor-size.ts"

export class OsuToEtternaConversion implements SkinConversion {
  readonly source = "osu"
  readonly target = "etterna"

  async convert(source: SkinModel): Promise<SkinModel> {
    if (source.game !== this.source) {
      throw new Error(`osu to Etterna conversion cannot convert a ${source.game} skin`)
    }

    assertCompletePlayfield(source)

    return {
      ...source,
      game: this.target,
      playfield: {
        ...source.playfield,
        hitPosition: getEtternaHitPosition(source.playfield.hitPosition),
        judgementPosition: getEtternaJudgementPosition(source.playfield.judgementPosition),
        comboPosition: getEtternaComboPosition(source.playfield.comboPosition),
        columnWidth: getEtternaReceptorSize(source.playfield.columnWidth),
      },
    }
  }
}

function assertCompletePlayfield(source: SkinModel): void {
  for (const [property, value] of Object.entries({
    hitPosition: source.playfield?.hitPosition,
    judgementPosition: source.playfield?.judgementPosition,
    comboPosition: source.playfield?.comboPosition,
    columnWidth: source.playfield?.columnWidth,
  })) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`osu to Etterna conversion requires a finite ${property}`)
    }
  }
}
