const etternaDefaultReceptorSize = 100
const osuEquivalentColumnWidth = 62

export function getColumnWidth(etternaReceptorSize: number): number {
  return Math.round(osuEquivalentColumnWidth + (etternaReceptorSize - etternaDefaultReceptorSize))
}
