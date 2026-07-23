import type { GameId } from "../../domain/game.ts"
import type { SkinModel, SkinReference } from "../../domain/skin.ts"

export interface SkinReader {
  game: GameId
  readSkin(reference: SkinReference): Promise<SkinModel>
}
