import os from "node:os"
import path from "node:path"
import addonAsset from "standalone-sharp:addon"
import libvipsAsset from "standalone-sharp:libvips"
import libvipsCppAsset from "standalone-sharp:libvips-cpp"
import { materializeNativeClosure } from "./native-cache.ts"
import {
  type StandaloneNativeAsset,
  standaloneNativeAssets,
  standaloneSharpVersion,
} from "./standalone-config.ts"

const embeddedAssets = [
  {
    path: addonAsset,
    definition: requireNativeAsset(`sharp-win32-x64-${standaloneSharpVersion}.node`),
  },
  {
    path: libvipsAsset,
    definition: requireNativeAsset("libvips-42.dll"),
  },
  {
    path: libvipsCppAsset,
    definition: requireNativeAsset("libvips-cpp-8.18.3.dll"),
  },
] as const

const nativeRoot = await materializeNativeClosure({
  cacheParent: path.join(os.tmpdir(), "vsrg-skin-converter", "standalone-native"),
  cacheName: `sharp-${standaloneSharpVersion}-${nativeCacheKey()}`,
  assets: embeddedAssets.map((asset) => ({
    sourcePath: asset.path,
    runtimeName: asset.definition.runtimeName,
    sha256: asset.definition.sha256,
  })),
})

const nativeBinding: unknown = require(
  path.join(nativeRoot, `sharp-win32-x64-${standaloneSharpVersion}.node`),
)
export default nativeBinding

function requireNativeAsset(runtimeName: string): StandaloneNativeAsset {
  const asset = standaloneNativeAssets.find((candidate) => candidate.runtimeName === runtimeName)
  if (!asset) throw new Error(`Missing standalone native asset definition: ${runtimeName}`)
  return asset
}

function nativeCacheKey(): string {
  return new Bun.CryptoHasher("sha256")
    .update(standaloneNativeAssets.map((asset) => asset.sha256).join(""))
    .digest("hex")
    .slice(0, 16)
}
