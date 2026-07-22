import type { SkinFolder } from "../constants/game.ts"
import type { Engine } from "./engine.ts"

export class OsuEngine implements Engine {
  getLocation(): string {
    throw new Error("Method not implemented.")
  }
  setLocation(location: string): void {
    throw new Error("Method not implemented.")
  }
  getSkins(): SkinFolder[] {
    throw new Error("Method not implemented.")
  }
  convertSkin(skin: SkinFolder): void {
    throw new Error("Method not implemented.")
  }
}
