import path from "node:path"

export const osuInstallationDirectoryName = "osu!"
export const osuDefaultLocation = `%LOCALAPPDATA%/${osuInstallationDirectoryName}`

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
