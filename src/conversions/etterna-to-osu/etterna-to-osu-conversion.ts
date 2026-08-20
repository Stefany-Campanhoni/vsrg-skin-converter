import type { SkinConversion } from "../../application/conversion/conversion-registry.ts"
import type { SkinModel } from "../../domain/skin.ts"
import { getColumnWidth } from "./convert-column-width.ts"
import { getComboPosition } from "./convert-combo-position.ts"
import { getHitPosition } from "./convert-hit-position.ts"
import { getJudgementPosition } from "./convert-judgement-position.ts"
import { getOsuManiaSpeed } from "./convert-scroll-speed.ts"

export class EtternaToOsuConversion implements SkinConversion {
  readonly source = "etterna"
  readonly target = "osu"

  async convert(source: SkinModel): Promise<SkinModel> {
    if (source.game !== this.source) {
      throw new Error(`Etterna to osu conversion cannot convert a ${source.game} skin`)
    }

    const receptorSize = source.playfield.columnWidth

    return {
      ...source,
      game: this.target,
      playfield: {
        ...source.playfield,
        hitPosition: getHitPosition(source.playfield.hitPosition),
        judgementPosition: getJudgementPosition(source.playfield.judgementPosition),
        comboPosition: getComboPosition(source.playfield.comboPosition),
        columnWidth: getColumnWidth(receptorSize),
        scrollSpeed: getOsuManiaSpeed(source.playfield.scrollSpeed, receptorSize),
      },
    }
  }
}
