import path from "node:path"

export function resolveApplicationRoot(moduleUrl: string): string {
  return path.dirname(Bun.fileURLToPath(moduleUrl))
}

export const applicationRoot = import.meta.dirname
