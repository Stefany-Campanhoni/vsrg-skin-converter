import {
  SourceFileNotFoundError,
  type SourceFiles,
} from "../../../application/ports/source-files.ts"
import type { Diagnostic } from "../../../domain/diagnostics.ts"
import { readSourceText } from "../../../infrastructure/filesystem/read-source-text.ts"
import { resolveSourcePath } from "../../../infrastructure/filesystem/resolve-source-path.ts"
import { sourceJoin } from "../../../infrastructure/filesystem/source-relative-path.ts"
import { assertSafeEtternaDirectorySegment } from "../settings/etterna-directory-segment.ts"
import { extractEtternaTheme } from "../theme/extract-etterna-theme.ts"
export interface EtternaSourceDiscovery {
  readonly skins: readonly { name: string; path: string }[]
  readonly profileIds: readonly string[]
  readonly theme: string
  readonly diagnostics: readonly Diagnostic[]
}
export async function discoverEtternaSource(source: SourceFiles): Promise<EtternaSourceDiscovery> {
  const root = await resolveSourcePath(source, "NoteSkins/dance", "directory")
  const skins = (await source.list(root))
    .filter((entry) => entry.kind === "directory")
    .map((entry) => ({ name: entry.name, path: sourceJoin(root, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (skins.length === 0)
    throw new Error("No dance NoteSkins found. Select the Etterna installation directory.")
  let profileIds: string[] = []
  try {
    const path = await resolveSourcePath(source, "Save/LocalProfiles", "directory")
    profileIds = (await source.list(path))
      .filter((entry) => entry.kind === "directory")
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  } catch (error) {
    if (!(error instanceof SourceFileNotFoundError)) throw error
  }
  let theme = "Rebirth"
  const diagnostics: Diagnostic[] = []
  try {
    const path = await resolveSourcePath(source, "Save/Preferences.ini")
    theme = extractEtternaTheme(await readSourceText(source, path), path)
  } catch (error) {
    if (!(error instanceof SourceFileNotFoundError)) throw error
    diagnostics.push({
      code: "web.etterna.default-theme",
      component: "settings",
      severity: "warning",
      message: "Missing theme preferences; using Rebirth settings paths.",
    })
  }
  assertSafeEtternaDirectorySegment(theme, "theme")
  return { skins, profileIds, theme, diagnostics }
}
