import { realpath, stat } from "node:fs/promises"
import path from "node:path"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import { readTextFile } from "../../../infrastructure/filesystem/bun-file.ts"
import { resolveEtternaThemeSettingsPath } from "../settings/etterna-settings-paths.ts"
import {
  type EtternaJudgementSelection,
  resolveEtternaJudgementUsing,
} from "./etterna-judgement-selection-policy.ts"

export type { EtternaJudgementSelection } from "./etterna-judgement-selection-policy.ts"

const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg"])

export async function readEtternaJudgementSelection(
  gameRoot: string,
  guid: string,
  theme: string,
): Promise<EtternaJudgementSelection> {
  const configPath = path.join(resolveEtternaThemeSettingsPath(gameRoot, theme), "assetsConfig.lua")
  let source: string
  try {
    source = await readTextFile(configPath)
  } catch (cause) {
    throw new Error(`Could not read Etterna asset configuration ${configPath}`, { cause })
  }
  return resolveEtternaJudgementUsing(
    source,
    guid,
    configPath,
    (path) => resolveSafeCandidate(gameRoot, path),
    (candidate) => resolveExistingFile(gameRoot, candidate),
  )
}

function resolveSafeCandidate(gameRoot: string, configuredPath: string): string {
  const normalizedParts = configuredPath.replace(/\\/g, "/").split("/")
  const hasFilesystemRoot =
    path.posix.isAbsolute(normalizedParts.join("/")) || path.win32.parse(configuredPath).root !== ""
  if (hasFilesystemRoot || normalizedParts.includes("..")) {
    throw new Error(`Unsafe Etterna judgement path: ${configuredPath}`)
  }

  const root = path.resolve(gameRoot)
  const resolved = path.resolve(root, ...normalizedParts)
  const relative = path.relative(root, resolved)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe Etterna judgement path: ${configuredPath}`)
  }
  if (!supportedImageExtensions.has(path.extname(resolved).toLowerCase())) {
    throw new Error(`Unsupported Etterna judgement image: ${configuredPath}`)
  }
  return resolved
}

async function resolveExistingFile(
  gameRoot: string,
  candidate: string,
): Promise<string | undefined> {
  try {
    const [realRoot, realCandidate] = await settleAll([realpath(gameRoot), realpath(candidate)])
    const relative = path.relative(realRoot, realCandidate)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Unsafe Etterna judgement path: ${candidate}`)
    }
    const metadata = await stat(realCandidate)
    return metadata.isFile() ? realCandidate : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}
