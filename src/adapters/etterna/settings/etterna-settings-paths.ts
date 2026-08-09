import path from "node:path"

const windowsReservedDeviceName = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i

export function resolveEtternaNoteSkinPath(gameRoot: string, skinName: string): string {
  assertSafeEtternaDirectorySegment(skinName, "NoteSkin name")
  return path.join(gameRoot, "NoteSkins", "dance", skinName)
}

export function resolveEtternaProfilesPath(gameRoot: string): string {
  return path.join(gameRoot, "Save", "LocalProfiles")
}

export function resolveEtternaProfilePath(gameRoot: string, profileId: string): string {
  assertSafeEtternaDirectorySegment(profileId, "profile ID")
  return path.join(resolveEtternaProfilesPath(gameRoot), profileId)
}

export function resolveEtternaProfileSettingsPath(
  gameRoot: string,
  profileId: string,
  theme: string,
): string {
  assertSafeEtternaDirectorySegment(theme, "theme")
  return path.join(resolveEtternaProfilePath(gameRoot, profileId), `${theme}_settings`)
}

export function resolveEtternaThemeSettingsPath(gameRoot: string, theme: string): string {
  assertSafeEtternaDirectorySegment(theme, "theme")
  return path.join(gameRoot, "Save", `${theme}_settings`)
}

export function resolveEtternaJudgmentsPath(gameRoot: string): string {
  return path.join(gameRoot, "Assets", "Judgments")
}

export function resolveEtternaJudgementPath(gameRoot: string, filename: string): string {
  assertSafeEtternaDirectorySegment(filename, "judgement filename")
  return path.join(resolveEtternaJudgmentsPath(gameRoot), filename)
}

export function assertSafeEtternaDirectorySegment(value: string, label: string): void {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    path.isAbsolute(value) ||
    hasWindowsInvalidCharacter(value) ||
    /[. ]$/.test(value) ||
    windowsReservedDeviceName.test(value)
  ) {
    throw new Error(`Unsafe Etterna ${label}: ${JSON.stringify(value)}`)
  }
}

function hasWindowsInvalidCharacter(value: string): boolean {
  const invalidCharacters = '<>:"/\\|?*'
  return [...value].some(
    (character) => character.charCodeAt(0) < 32 || invalidCharacters.includes(character),
  )
}
