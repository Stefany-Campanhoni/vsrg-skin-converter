import path from "node:path"
import { readEtternaVisualSkinFromSource } from "../../src/adapters/etterna/reader/read-etterna-visual-skin-from-source.ts"
import type { ImageAsset } from "../../src/domain/image.ts"
import type { VisualSkinModel } from "../../src/domain/visual-skin.ts"
import { createNativeSourceFiles } from "../../src/infrastructure/filesystem/native-source-files.ts"
import { createRegisteredAssetLoader } from "../../src/infrastructure/filesystem/registered-asset-loader.ts"
import { createImageOperations } from "../../src/infrastructure/image/shared-image-operations.ts"
import { createSharpImageBackend } from "../../src/infrastructure/image/sharp-image-backend.ts"
export async function auditBrowserSkins(
  root: string,
): Promise<{ checked: number; failures: readonly string[] }> {
  const source = await createNativeSourceFiles(root),
    loader = createRegisteredAssetLoader(),
    backend = createSharpImageBackend(),
    images = createImageOperations(loader, backend)
  loader.register(source)
  const cases: {
      name: string
      asset: ImageAsset
      width: number
      height: number
      pixelSha256: string
    }[] = [],
    failures: string[] = [],
    unsupported: string[] = []
  let checked = 0,
    index = 0
  try {
    for (const directory of await source.list("")) {
      if (directory.kind !== "directory") continue
      const label = `case-${++index}`
      let skin: VisualSkinModel
      try {
        skin = (
          await readEtternaVisualSkinFromSource(source, images, {
            skinPath: directory.name,
            name: directory.name,
            theme: "Rebirth",
            useDefaultSettings: true,
          })
        ).skin
      } catch {
        unsupported.push(`${label}: source unsupported by native static reader`)
        continue
      }
      const assets: ImageAsset[] = []
      for (const receptor of Object.values(skin.assets.receptors ?? {}))
        assets.push(receptor.normal, receptor.pressed)
      assets.push(...Object.values(skin.assets.tapNotes ?? {}))
      const unique = new Map(assets.map((asset) => [JSON.stringify(asset), asset]))
      for (const asset of unique.values()) {
        try {
          const name = `corpus-${cases.length}`,
            bytes = await source.readAsset(asset.filePath),
            decoded = await backend.decodeRgba(await images.renderNote(asset))
          await Bun.write(path.resolve(".tmp/browser-reference", `${name}.source`), bytes)
          cases.push({
            name,
            asset: { ...asset, filePath: `${name}.source` },
            width: decoded.width,
            height: decoded.height,
            pixelSha256: new Bun.CryptoHasher("sha256").update(decoded.pixels).digest("hex"),
          })
        } catch {
          failures.push(`${label}: native image processing failed`)
        }
      }
      checked++
    }
  } finally {
    loader.clear()
    await backend.dispose()
  }
  await Bun.write(".tmp/browser-reference/corpus.json", JSON.stringify(cases))
  await Bun.write(
    ".tmp/browser-corpus-report.json",
    JSON.stringify({ checked, images: cases.length, unsupported, failures }, null, 2),
  )
  return { checked, failures }
}
if (import.meta.main) {
  const root = Bun.argv[2]
  if (!root) throw new Error("Pass the local ignored skin corpus directory")
  const result = await auditBrowserSkins(root)
  console.log(JSON.stringify(result))
  if (result.failures.length) process.exitCode = 1
}
