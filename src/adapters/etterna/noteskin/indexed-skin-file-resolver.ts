import type { ColumnDirection } from "../../../domain/image.ts"
import {
  sourceBasename,
  sourceExtname,
  sourceIsAbsolute,
  sourceJoin,
} from "../../../infrastructure/filesystem/source-relative-path.ts"
import { parseEtternaImageMetadata } from "../image/parse-etterna-image-metadata.ts"

const path = {
  basename: (value: string, extension?: string) => {
    const name = sourceBasename(value)
    return extension ? name.slice(0, -extension.length) : name
  },
  extname: sourceExtname,
  isAbsolute: sourceIsAbsolute,
  join: sourceJoin,
  dirname: (value: string) => {
    const normal = value.replace(/\\/g, "/")
    return normal.includes("/") ? normal.slice(0, normal.lastIndexOf("/")) : "."
  },
  relative: (root: string, file: string) => file.slice(root.length + 1),
}
export interface ResolvedSkinAsset {
  filePath: string
  columns: number
  rows: number
}

export interface SkinFileResolver {
  resolveAssets(...logicalParts: string[]): ResolvedSkinAsset[]
  resolveElementLua(direction: ColumnDirection, element: string): Promise<string | undefined>
  resolveReceptorLua(direction: ColumnDirection): Promise<string | undefined>
}

interface IndexedFile {
  relativePath: string
  absolutePath: string
  extension: string
  logicalNames: string[]
  columns: number
  rows: number
}

const imageExtensions = new Set([".png", ".jpg", ".jpeg"])

export function createIndexedSkinFileResolver(
  root: string,
  paths: readonly string[],
  readTextFile: (id: string) => Promise<string>,
  assetIdentity: (path: string) => string = (path) => path,
): SkinFileResolver {
  const files = paths
    .map((file) => indexFile(root, file, assetIdentity))
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

    async resolveElementLua(
      direction: ColumnDirection,
      element: string,
    ): Promise<string | undefined> {
      return resolveLuaTarget(`${capitalize(direction)} ${element}`, new Set())
    },

    async resolveReceptorLua(direction: ColumnDirection): Promise<string | undefined> {
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

    const redirectedTarget = (await readTextFile(redirect.absolutePath)).trim()
    return resolveLuaTarget(redirectedTarget, visited)
  }

  function findByTarget(target: string, extension: string): IndexedFile | undefined {
    return files.find(
      (file) =>
        file.extension === extension &&
        (normalizePathStem(file.relativePath) === target ||
          normalizePathStem(path.basename(file.relativePath)) === target),
    )
  }
}

function indexFile(
  root: string,
  absolutePath: string,
  assetIdentity: (path: string) => string,
): IndexedFile {
  const extension = path.extname(absolutePath).toLowerCase()
  const stem = path.basename(absolutePath, path.extname(absolutePath))
  const { logicalStem, columns, rows } = parseEtternaImageMetadata(stem)

  return {
    absolutePath: assetIdentity(absolutePath),
    relativePath: path.relative(root, absolutePath),
    extension,
    logicalNames: [
      normalizeLogicalName(logicalStem),
      normalizeLogicalName(path.join(path.dirname(path.relative(root, absolutePath)), logicalStem)),
    ],
    columns,
    rows,
  }
}

function normalizeRequestedName(value: string): string {
  const withoutExtension = value.replace(/\.(?:png|jpe?g)$/i, "")
  return normalizeLogicalName(parseEtternaImageMetadata(withoutExtension).logicalStem)
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
