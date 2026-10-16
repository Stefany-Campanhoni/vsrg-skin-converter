import type { GameId } from "../../domain/game.ts"
import type { GeneratedFile } from "../../domain/generated-file.ts"
import type { VisualSkinModel } from "../../domain/visual-skin.ts"
export interface VisualSkinExporter {
  readonly game: GameId
  exportSkin(skin: VisualSkinModel): Promise<readonly GeneratedFile[]>
}
