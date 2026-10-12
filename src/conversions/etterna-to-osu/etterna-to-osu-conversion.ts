import type { SkinConversion } from "../../application/conversion/conversion-registry.ts"
import type { SkinModel } from "../../domain/skin.ts"
import { getOsuManiaSpeed } from "./convert-scroll-speed.ts"
import { convertEtternaVisualPlayfield } from "./etterna-to-osu-visual-conversion.ts"

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
        ...convertEtternaVisualPlayfield(source.playfield),
        scrollSpeed: getOsuManiaSpeed(source.playfield.scrollSpeed, receptorSize),
      },
    }
  }
}
