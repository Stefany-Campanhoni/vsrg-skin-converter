const etternaLogicalResolutionDecoration = " (res 64x64)"

export const etternaTapNoteOutputHeight = 150
export const etternaReceptorOutputHeight = 146

export function getEtternaOutputAssetFilename(logicalName: string): string {
  return `${logicalName}${etternaLogicalResolutionDecoration}.png`
}
