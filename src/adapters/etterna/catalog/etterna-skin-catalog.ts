import { readdir } from "node:fs/promises"
import path from "node:path"
import type { SkinCatalog } from "../../../application/ports/skin-catalog.ts"
import type { SkinReference } from "../../../domain/skin.ts"

export class EtternaSkinCatalog implements SkinCatalog {
  async listSkins(location: string): Promise<SkinReference[]> {
    const skinRoot = path.join(location, "NoteSkins", "dance")
    const entries = await readdir(skinRoot, { withFileTypes: true })

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        game: "etterna" as const,
        name: entry.name,
        sourcePath: path.join(skinRoot, entry.name),
        gameRoot: location,
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }
}
