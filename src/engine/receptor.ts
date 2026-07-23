export const receptorDirections = ["left", "down", "up", "right"] as const
export type Direction = (typeof receptorDirections)[number]

export const receptorStates = ["normal", "pressed"] as const
export type ReceptorState = (typeof receptorStates)[number]

export interface SpriteFrame {
  index: number
  columns: number
  rows: number
}

export interface ReceptorImage {
  filePath: string
  frame?: SpriteFrame
  rotation: number
}

export interface ReceptorCandidate extends ReceptorImage {
  state: ReceptorState
  score: number
  evidence: string[]
}

export interface ResolvedReceptor {
  normal: ReceptorImage
  pressed: ReceptorImage
}

export type ReceptorSet = Record<Direction, ResolvedReceptor>
