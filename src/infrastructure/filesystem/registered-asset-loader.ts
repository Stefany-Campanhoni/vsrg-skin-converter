import type { AssetLoader } from "../../application/ports/asset-loader.ts"
import type { SourceFiles } from "../../application/ports/source-files.ts"
export function createRegisteredAssetLoader(): AssetLoader & {
  register(source: SourceFiles): void
  clear(): void
} {
  const sources = new Set<SourceFiles>()
  return {
    register(source) {
      sources.add(source)
    },
    clear() {
      sources.clear()
    },
    async read(id) {
      const owners = [...sources].filter((source) => source.ownsAsset(id))
      if (owners.length !== 1) throw new Error("Asset must belong to exactly one registered source")
      const owner = owners[0]
      if (!owner) throw new Error("No registered source")
      return owner.readAsset(id)
    },
  }
}
