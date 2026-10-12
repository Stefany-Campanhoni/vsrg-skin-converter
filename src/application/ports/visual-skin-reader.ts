import type { GameId } from "../../domain/game.ts"
import type { SkinReference } from "../../domain/skin.ts"
import type { VisualSkinModel } from "../../domain/visual-skin.ts"
export interface VisualSkinReader {
  readonly game: GameId
  readSkin(reference: SkinReference): Promise<VisualSkinModel>
}
