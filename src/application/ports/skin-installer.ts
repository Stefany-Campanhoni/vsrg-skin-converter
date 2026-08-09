import type { GameId } from "../../domain/game.ts"
import type { SkinModel } from "../../domain/skin.ts"

export interface SkinInstaller {
  readonly game: GameId
  installSkin(skin: SkinModel): Promise<void>
}
