import path from "node:path"

import { osuInstallationDirectoryName } from "./osu-location-defaults.ts"

export { osuDefaultLocation, osuInstallationDirectoryName } from "./osu-location-defaults.ts"

export function resolveDefaultOsuInstallationDirectory(
  localAppData: string | undefined,
): string | undefined {
  if (!localAppData?.trim()) {
    return undefined
  }
  if (!path.isAbsolute(localAppData)) {
    throw new Error(`Expected an absolute LOCALAPPDATA path: ${JSON.stringify(localAppData)}`)
  }
  return path.join(localAppData, osuInstallationDirectoryName)
}
