import { getEtternaCmod } from "../osu-to-etterna/convert-scroll-speed.ts"

export function getOsuManiaSpeed(cmod: number, receptorSize: number): number {
  if (!Number.isSafeInteger(cmod) || cmod <= 0) {
    throw new Error("Expected a positive integer CMod within the safe-integer range")
  }
  assertPositiveFinite(receptorSize, "receptor size")
  let candidate = Number(((435 * cmod) / 13720).toFixed(2))
  while (getEtternaCmod(candidate, receptorSize) < cmod) {
    const nextCandidate = candidate + 1
    if (!Number.isFinite(nextCandidate) || nextCandidate <= candidate) {
      throw new Error(
        `Could not convert CMod ${cmod} with receptor size ${receptorSize}: the ManiaSpeed search could not advance`,
      )
    }
    candidate = nextCandidate
  }
  const maniaSpeed = Math.round(candidate)
  if (!Number.isSafeInteger(maniaSpeed) || maniaSpeed <= 0) {
    throw new Error(
      `Could not convert CMod ${cmod} with receptor size ${receptorSize} to a positive integer ManiaSpeed within the safe-integer range`,
    )
  }
  return maniaSpeed
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive finite ${name}`)
  }
}
