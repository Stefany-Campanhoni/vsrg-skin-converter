import path from "node:path"
import { fileURLToPath } from "node:url"

export function resolveApplicationRoot(moduleUrl: string): string {
  return path.dirname(fileURLToPath(moduleUrl))
}

export const applicationRoot = resolveApplicationRoot(import.meta.url)
