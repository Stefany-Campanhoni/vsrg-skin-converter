import type { SkinFolder, SupportedGame } from "../constants/game.ts"
import { EtternaEngine } from "./etterna/etterna.ts"
import { OsuEngine } from "./osu.ts"

export interface Engine {
  getLocation(): string
  setLocation(location: string): void
  getSkins(): SkinFolder[]
  convertSkin(skin: SkinFolder): void
}

export function createEngine(game: SupportedGame): Engine {
  switch (game) {
    case "etterna":
      return new EtternaEngine()
    case "osu":
      return new OsuEngine()
    default:
      throw new Error(`Unsupported game: ${game}`)
  }
}
