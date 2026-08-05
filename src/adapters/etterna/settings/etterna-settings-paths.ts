import path from "node:path"

export function resolveEtternaProfilesPath(gameRoot: string): string {
  return path.join(gameRoot, "Save", "LocalProfiles")
}

export function resolveEtternaProfilePath(gameRoot: string, profileId: string): string {
  assertSafeDirectoryName(profileId, "profile ID")
  return path.join(resolveEtternaProfilesPath(gameRoot), profileId)
}

export function resolveEtternaProfileSettingsPath(
  gameRoot: string,
  profileId: string,
  theme: string,
): string {
  assertSafeDirectoryName(theme, "theme")
  return path.join(resolveEtternaProfilePath(gameRoot, profileId), `${theme}_settings`)
}

export function resolveEtternaThemeSettingsPath(gameRoot: string, theme: string): string {
  assertSafeDirectoryName(theme, "theme")
  return path.join(gameRoot, "Save", `${theme}_settings`)
}

function assertSafeDirectoryName(value: string, label: string): void {
  if (
    value.trim().length === 0 ||
    value === "." ||
    value === ".." ||
    path.isAbsolute(value) ||
    /[\\/\0]/.test(value)
  ) {
    throw new Error(`Unsafe Etterna ${label}: ${JSON.stringify(value)}`)
  }
}
