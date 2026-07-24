export interface EtternaImageMetadata {
  logicalStem: string
  columns: number
  rows: number
  doubleResolution: boolean
}

const layoutPattern = /\s(\d+)x(\d+)(?=\s*(?:\((?:doubleres|res [^)]*)\)\s*)*$)/i
const trailingMetadataPattern = /\s*\((?:doubleres|res [^)]*)\)\s*$/i

export function parseEtternaImageMetadata(stem: string): EtternaImageMetadata {
  const layout = layoutPattern.exec(stem)
  const trailingMetadata = trailingMetadataPattern.exec(stem)
  const decorationIndex = layout?.index ?? trailingMetadata?.index

  return {
    logicalStem: decorationIndex === undefined ? stem : stem.slice(0, decorationIndex).trimEnd(),
    columns: Number(layout?.[1] ?? 1),
    rows: Number(layout?.[2] ?? 1),
    doubleResolution: /\(doubleres\)/i.test(stem),
  }
}
