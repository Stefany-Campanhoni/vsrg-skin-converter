export const supportedGames = ["etterna", "osu"] as const
export type SupportedGame = (typeof supportedGames)[number]

export type SkinFolder = {
  name: string
  fullPath: string
}

export type SkinPositions = {
  hitPosition: number
  judgementPosition: number
  comboPosition: number
}
