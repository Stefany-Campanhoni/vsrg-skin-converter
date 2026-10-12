import type { GameId } from "../../domain/game.ts"
import type { VisualSkinModel } from "../../domain/visual-skin.ts"
export interface VisualSkinConversion {
  readonly source: GameId
  readonly target: GameId
  convert(source: VisualSkinModel): Promise<VisualSkinModel>
}
export class VisualConversionRegistry {
  readonly #conversions = new Map<string, VisualSkinConversion>()
  constructor(conversions: readonly VisualSkinConversion[]) {
    for (const conversion of conversions) {
      const key = `${conversion.source}:${conversion.target}`
      if (this.#conversions.has(key))
        throw new Error(
          `Duplicate conversion registration for ${conversion.source} to ${conversion.target}`,
        )
      this.#conversions.set(key, conversion)
    }
  }
  resolve(source: GameId, target: GameId): VisualSkinConversion {
    const conversion = this.#conversions.get(`${source}:${target}`)
    if (!conversion) throw new Error(`No conversion is registered from ${source} to ${target}`)
    return conversion
  }
}
