import type { SkinConversion } from "../../application/conversion/conversion-registry.ts"
import type { SkinModel } from "../../domain/skin.ts"
import { getHitPosition } from "./convert-hit-position.ts"

export class EtternaToOsuConversion implements SkinConversion {
  readonly source = "etterna"
  readonly target = "osu"

  async convert(source: SkinModel): Promise<SkinModel> {
    if (source.game !== this.source) {
      throw new Error(`Etterna to osu conversion cannot convert a ${source.game} skin`)
    }

    return {
      ...source,
      game: this.target,
      playfield: {
        ...source.playfield,
        hitPosition: getHitPosition(source.playfield.hitPosition),
      },
    }
  }
}
