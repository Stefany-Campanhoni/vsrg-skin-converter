import { assertSafeEtternaDirectorySegment } from "./etterna-directory-segment.ts"

export { assertSafeEtternaDirectorySegment } from "./etterna-directory-segment.ts"

import path from "node:path"

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
