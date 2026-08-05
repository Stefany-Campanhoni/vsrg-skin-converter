import { readFile } from "node:fs/promises"
import path from "node:path"

export async function readEtternaTheme(gameRoot: string): Promise<string> {
  const preferencesPath = path.join(gameRoot, "Save", "Preferences.ini")
  let source: string
  try {
    source = await readFile(preferencesPath, "utf8")
  } catch (cause) {
    throw new Error(`Could not read Etterna theme preferences ${preferencesPath}`, { cause })
  }
  return extractEtternaTheme(source, preferencesPath)
}

export function extractEtternaTheme(source: string, preferencesPath: string): string {
  let inOptions = false
  let theme: string | undefined
  let defaultTheme: string | undefined

  for (const line of source.split(/\r?\n/)) {
    const section = /^\s*\[([^\]]+)]\s*$/.exec(line)
    if (section) {
      inOptions = section[1]?.trim().toLowerCase() === "options"
      continue
    }
    if (!inOptions) {
      continue
    }
    const assignment = /^\s*([^=]+)=(.*)$/.exec(line)
    if (!assignment) {
      continue
    }
    const key = assignment[1]?.trim().toLowerCase()
    const value = assignment[2]?.trim()
    if (key === "theme") {
      theme = value
    }
    if (key === "defaulttheme") {
      defaultTheme = value
    }
  }

  const resolvedTheme = theme || defaultTheme
  if (!resolvedTheme) {
    throw new Error(`Etterna theme is not configured in ${preferencesPath}`)
  }
  return resolvedTheme
}
