const etternaDefaultReceptorSize = 100
const osuEquivalentColumnWidth = 62

export function getEtternaReceptorSize(osuAverageColumnWidth: number): number {
  return Math.round(osuAverageColumnWidth - osuEquivalentColumnWidth + etternaDefaultReceptorSize)
}
