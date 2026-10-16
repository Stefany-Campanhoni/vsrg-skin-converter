import type { SkinConversion } from "../../application/conversion/conversion-registry.ts"
import type { SkinModel } from "../../domain/skin.ts"
import { getEtternaCmod } from "./convert-scroll-speed.ts"
import { convertOsuVisualPlayfield } from "./osu-to-etterna-visual-conversion.ts"

export class OsuToEtternaConversion implements SkinConversion {
  readonly source = "osu"
  readonly target = "etterna"

  async convert(source: SkinModel): Promise<SkinModel> {
    if (source.game !== this.source) {
      throw new Error(`osu to Etterna conversion cannot convert a ${source.game} skin`)
    }

    assertCompletePlayfield(source)

    const visual = convertOsuVisualPlayfield(source.playfield)
    const receptorSize = visual.columnWidth

    return {
      ...source,
      game: this.target,
      playfield: {
        ...source.playfield,
        ...visual,
        scrollSpeed: getEtternaCmod(source.playfield.scrollSpeed, receptorSize),
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
    scrollSpeed: source.playfield?.scrollSpeed,
  })) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`osu to Etterna conversion requires a finite ${property}`)
    }
  }
}
