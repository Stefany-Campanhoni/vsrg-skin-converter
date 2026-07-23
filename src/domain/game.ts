export const gameIds = ["etterna", "osu"] as const

export type GameId = (typeof gameIds)[number]
