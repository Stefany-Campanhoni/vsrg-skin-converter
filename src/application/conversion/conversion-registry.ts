import type { GameId } from "../../domain/game.ts"
import type { SkinModel } from "../../domain/skin.ts"

export interface SkinConversion {
  source: GameId
  target: GameId
  convert(source: SkinModel): Promise<SkinModel>
}

export class ConversionRegistry {
  readonly #conversions = new Map<string, SkinConversion>()

  constructor(conversions: readonly SkinConversion[]) {
    for (const conversion of conversions) {
      const key = conversionKey(conversion.source, conversion.target)
      if (this.#conversions.has(key)) {
        throw new Error(
          `Duplicate conversion registration for ${conversion.source} to ${conversion.target}`,
        )
      }
      this.#conversions.set(key, conversion)
    }
  }

  resolve(source: GameId, target: GameId): SkinConversion {
    const conversion = this.#conversions.get(conversionKey(source, target))
    if (!conversion) {
      throw new Error(`No conversion is registered from ${source} to ${target}`)
    }
    return conversion
  }
}

function conversionKey(source: GameId, target: GameId): string {
  return `${source}:${target}`
}
