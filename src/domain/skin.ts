import type { Diagnostic } from "./diagnostics.ts"
import type { GameId } from "./game.ts"
import type { ReceptorSet, TapNoteSet } from "./image.ts"

export interface SkinReference {
  game: GameId
  name: string
  sourcePath: string
  gameRoot: string
}

export interface SkinMetadata {
  name: string
}

export interface PlayfieldConfiguration {
  hitPosition: number
  judgementPosition: number
  comboPosition: number
}

export interface SkinAssets {
  receptors?: ReceptorSet
  tapNotes?: TapNoteSet
}

export interface SkinModel {
  game: GameId
  metadata: SkinMetadata
  playfield: PlayfieldConfiguration
  assets: SkinAssets
  diagnostics: Diagnostic[]
}
