import type { SkinReference } from "../../domain/skin.ts"

export interface SkinCatalog {
  listSkins(location: string): Promise<SkinReference[]>
}
