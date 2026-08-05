import path from "node:path"
import { osuInstallationDirectoryName } from "./osu-installation.ts"

export const osuTemplatesPath = path.resolve("src", "templates")

export function resolveOsuSkinOutputPath(
  skinName: string,
  localAppData: string | undefined,
): string {
  if (!localAppData?.trim()) {
    throw new Error("LOCALAPPDATA is required to locate osu! skins")
  }
  if (!path.isAbsolute(localAppData)) {
    throw new Error(`Expected an absolute LOCALAPPDATA path: ${JSON.stringify(localAppData)}`)
  }
  assertSafeSkinName(skinName)
  return path.join(localAppData, osuInstallationDirectoryName, "Skins", skinName)
}

function assertSafeSkinName(skinName: string): void {
  if (
    skinName.trim().length === 0 ||
    skinName === "." ||
    skinName === ".." ||
    path.isAbsolute(skinName) ||
    /[\\/\0]/.test(skinName)
  ) {
    throw new Error(`Unsafe osu! skin name: ${JSON.stringify(skinName)}`)
  }
}
