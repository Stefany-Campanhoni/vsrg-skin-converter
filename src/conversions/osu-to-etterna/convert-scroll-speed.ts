export function getEtternaCmod(maniaSpeed: number, receptorSize: number): number {
  assertPositiveFinite(maniaSpeed, "ManiaSpeed")
  assertPositiveFinite(receptorSize, "receptor size")
  const correction = receptorSize > 100 ? 35 : 0
  return Math.round(((435.59 * maniaSpeed) / 13.72 + correction) / (receptorSize / 100))
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive finite ${name}`)
  }
}
