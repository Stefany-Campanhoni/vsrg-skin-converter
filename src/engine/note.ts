import type { Direction } from "./receptor.ts"

export interface NoteFrame {
  index: number
  columns: number
  rows: number
}

export interface NoteImage {
  filePath: string
  frame?: NoteFrame
  rotation: number
}

export type NoteSet = Record<Direction, NoteImage>
