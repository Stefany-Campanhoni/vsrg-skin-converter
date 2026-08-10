import path from "node:path"
import { applicationRoot } from "../application-root.ts"

export const osuTemplatesPath = path.join(applicationRoot, "templates", "osu")
export const etternaTemplatesPath = path.join(applicationRoot, "templates", "etterna")

export function resolveOsuSkinOutputPath(
  skinName: string,
  osuInstallationDirectory: string,
): string {
  if (!path.isAbsolute(osuInstallationDirectory)) {
    throw new Error(
      `Expected an absolute osu! installation path: ${JSON.stringify(osuInstallationDirectory)}`,
    )
  }
  assertSafeSkinName(skinName)
  return path.join(osuInstallationDirectory, "Skins", skinName)
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
