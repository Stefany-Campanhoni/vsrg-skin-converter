import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { Direction } from "../../receptor.ts"

export interface ResolvedSkinAsset {
  filePath: string
  columns: number
  rows: number
}

export interface SkinFileResolver {
  resolveAssets(...logicalParts: string[]): ResolvedSkinAsset[]
  resolveElementLua(direction: Direction, element: string): Promise<string | undefined>
  resolveReceptorLua(direction: Direction): Promise<string | undefined>
}

interface IndexedFile {
  absolutePath: string
  extension: string
  logicalNames: string[]
  columns: number
  rows: number
}

const imageExtensions = new Set([".png", ".jpg", ".jpeg"])

export async function createSkinFileResolver(skinDirectory: string): Promise<SkinFileResolver> {
  const root = path.resolve(skinDirectory)
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => indexFile(root, path.join(entry.parentPath, entry.name)))
    .sort((left, right) => left.absolutePath.localeCompare(right.absolutePath))

  return {
    resolveAssets(...logicalParts: string[]): ResolvedSkinAsset[] {
      if (logicalParts.some(isUnsafeLogicalPath)) {
        return []
      }

      const logicalName = normalizeRequestedName(logicalParts.join(" "))
      return files
        .filter(
          (file) =>
            imageExtensions.has(file.extension) &&
            file.logicalNames.some(
              (candidate) => candidate === logicalName || candidate.startsWith(`${logicalName} `),
            ),
        )
        .map(({ absolutePath: filePath, columns, rows }) => ({ filePath, columns, rows }))
    },

    async resolveElementLua(direction: Direction, element: string): Promise<string | undefined> {
      return resolveLuaTarget(`${capitalize(direction)} ${element}`, new Set())
    },

    async resolveReceptorLua(direction: Direction): Promise<string | undefined> {
      return resolveLuaTarget(`${capitalize(direction)} Receptor`, new Set())
    },
  }

  async function resolveLuaTarget(
    target: string,
    visited: Set<string>,
  ): Promise<string | undefined> {
    if (isUnsafeLogicalPath(target)) {
      throw new Error(`Element redirect points outside the skin: ${target}`)
    }

    const normalizedTarget = normalizePathStem(target)
    if (visited.has(normalizedTarget)) {
      throw new Error(`Element redirect cycle detected at ${target}`)
    }
    visited.add(normalizedTarget)

    const lua = findByTarget(normalizedTarget, ".lua")
    if (lua) {
      return lua.absolutePath
    }

    const redirect = findByTarget(normalizedTarget, ".redir")
    if (!redirect) {
      return undefined
    }

    const redirectedTarget = (await readFile(redirect.absolutePath, "utf8")).trim()
    return resolveLuaTarget(redirectedTarget, visited)
  }

  function findByTarget(target: string, extension: string): IndexedFile | undefined {
    return files.find(
      (file) =>
        file.extension === extension &&
        (normalizePathStem(file.absolutePath.slice(root.length + 1)) === target ||
          normalizePathStem(path.basename(file.absolutePath)) === target),
    )
  }
}

function indexFile(root: string, absolutePath: string): IndexedFile {
  const extension = path.extname(absolutePath).toLowerCase()
  const stem = path.basename(absolutePath, path.extname(absolutePath))
  const { logicalStem, columns, rows } = parseDecoratedStem(stem)

  return {
    absolutePath,
    extension,
    logicalNames: [
      normalizeLogicalName(logicalStem),
      normalizeLogicalName(path.join(path.dirname(path.relative(root, absolutePath)), logicalStem)),
    ],
    columns,
    rows,
  }
}

function parseDecoratedStem(stem: string): {
  logicalStem: string
  columns: number
  rows: number
} {
  const layout = /\s(\d+)x(\d+)(?=\s*(?:\((?:doubleres|res [^)]*)\)\s*)*$)/i.exec(stem)
  const metadata = /\s*\((?:doubleres|res [^)]*)\)\s*$/i.exec(stem)
  const decorationIndex = layout?.index ?? metadata?.index

  return {
    logicalStem: decorationIndex === undefined ? stem : stem.slice(0, decorationIndex).trimEnd(),
    columns: Number(layout?.[1] ?? 1),
    rows: Number(layout?.[2] ?? 1),
  }
}

function normalizeRequestedName(value: string): string {
  const withoutExtension = value.replace(/\.(?:png|jpe?g)$/i, "")
  return normalizeLogicalName(parseDecoratedStem(withoutExtension).logicalStem)
}

function normalizeLogicalName(value: string): string {
  return value
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function normalizePathStem(value: string): string {
  const extension = path.extname(value)
  return value
    .slice(0, extension ? -extension.length : undefined)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .trim()
    .toLowerCase()
}

function isUnsafeLogicalPath(value: string): boolean {
  return path.isAbsolute(value) || value.replace(/\\/g, "/").split("/").includes("..")
}

function capitalize(value: string): string {
  return value[0]?.toUpperCase() + value.slice(1)
}
