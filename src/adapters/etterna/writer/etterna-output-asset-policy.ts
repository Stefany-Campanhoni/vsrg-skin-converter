const etternaLogicalResolutionDecoration = " (res 64x64)"

export const etternaTapNoteOutputSize = { width: 150, height: 150 } as const
export const etternaReceptorOutputSize = { width: 146, height: 146 } as const

export function getEtternaOutputAssetFilename(logicalName: string): string {
  return `${logicalName}${etternaLogicalResolutionDecoration}.png`
}
