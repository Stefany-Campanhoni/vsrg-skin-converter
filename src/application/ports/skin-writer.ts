import type { GameId } from "../../domain/game.ts"
import type { SkinModel } from "../../domain/skin.ts"

export interface SkinWriter {
  game: GameId
  writeSkin(skin: SkinModel, workspace: string): Promise<void>
}
