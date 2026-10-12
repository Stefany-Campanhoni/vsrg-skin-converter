export interface AssetLoader {
  read(assetId: string): Promise<Uint8Array>
}
