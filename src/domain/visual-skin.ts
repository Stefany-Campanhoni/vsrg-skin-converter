import type { Diagnostic } from "./diagnostics.ts"
import type { GameId } from "./game.ts"
import type { PlayfieldConfiguration, SkinAssets, SkinMetadata } from "./skin.ts"
export type VisualPlayfieldConfiguration = Omit<PlayfieldConfiguration, "scrollSpeed">
export interface VisualSkinModel {
  readonly game: GameId
  readonly metadata: SkinMetadata
  readonly playfield: VisualPlayfieldConfiguration
  readonly assets: SkinAssets
  readonly diagnostics: Diagnostic[]
}
