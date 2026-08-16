import { getEtternaCmod } from "../osu-to-etterna/convert-scroll-speed.ts"

export function getOsuManiaSpeed(cmod: number, receptorSize: number): number {
  if (!Number.isInteger(cmod) || cmod <= 0) throw new Error("Expected a positive integer CMod")
  assertPositiveFinite(receptorSize, "receptor size")
  let candidate = Number(((435 * cmod) / 13720).toFixed(2))
  while (getEtternaCmod(candidate, receptorSize) < cmod) candidate += 1
  return Math.round(candidate)
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive finite ${name}`)
  }
}
