export const columnDirections = ["left", "down", "up", "right"] as const

export type ColumnDirection = (typeof columnDirections)[number]

export interface SpriteFrame {
  index: number
  columns: number
  rows: number
}

export interface ImageAsset {
  filePath: string
  frame?: SpriteFrame
  rotation: number
}

export const receptorStates = ["normal", "pressed"] as const

export type ReceptorState = (typeof receptorStates)[number]

export type ReceptorSet = Record<ColumnDirection, Record<ReceptorState, ImageAsset>>

export type TapNoteSet = Record<ColumnDirection, ImageAsset>
