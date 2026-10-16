import { extractEtternaTheme } from "./extract-etterna-theme.ts"

export { extractEtternaTheme } from "./extract-etterna-theme.ts"

import path from "node:path"
import { readTextFile } from "../../../infrastructure/filesystem/bun-file.ts"

export async function readEtternaTheme(gameRoot: string): Promise<string> {
  const preferencesPath = path.join(gameRoot, "Save", "Preferences.ini")
  let source: string
  try {
    source = await readTextFile(preferencesPath)
  } catch (cause) {
    throw new Error(`Could not read Etterna theme preferences ${preferencesPath}`, { cause })
  }
  return extractEtternaTheme(source, preferencesPath)
}
