import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import luaparse, { type Chunk, type Expression } from "luaparse"
import type { Diagnostic } from "../../../domain/diagnostics.ts"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"
import { type AstObject, asAstObject, getTableField } from "../../../infrastructure/lua/ast.ts"
import { evaluateLuaString } from "../../../infrastructure/lua/evaluate-expression.ts"

export interface EtternaJudgementSelection {
  filePath: string
  diagnostics: Diagnostic[]
}

interface ConfiguredPaths {
  configured: string | undefined
  fallback: string
}

const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg"])

export async function readEtternaJudgementSelection(
  gameRoot: string,
  guid: string,
): Promise<EtternaJudgementSelection> {
  const configPath = path.join(gameRoot, "Save", "Rebirth_settings", "assetsConfig.lua")
  const source = await readFile(configPath, "utf8")
  const { configured, fallback } = extractConfiguredPaths(source, guid, configPath)
  const fallbackCandidate = resolveSafeCandidate(gameRoot, fallback)
  const configuredCandidate = configured ? resolveSafeCandidate(gameRoot, configured) : undefined
  const [configuredFile, fallbackFile] = await settleAll([
    configuredCandidate
      ? resolveExistingFile(gameRoot, configuredCandidate)
      : Promise.resolve(undefined),
    resolveExistingFile(gameRoot, fallbackCandidate),
  ])

  if (!fallbackFile) {
    throw new Error(`Etterna default judgement does not exist: ${fallbackCandidate}`)
  }
  if (!configured) {
    return {
      filePath: fallbackFile,
      diagnostics: [missingGuidDiagnostic(guid, fallback)],
    }
  }
  if (!configuredFile) {
    return {
      filePath: fallbackFile,
      diagnostics: [missingFileDiagnostic(configured, fallback)],
    }
  }
  return { filePath: configuredFile, diagnostics: [] }
}

function extractConfiguredPaths(source: string, guid: string, configPath: string): ConfiguredPaths {
  const ast = parseAssetConfig(source, configPath)
  const returnStatement = ast.body.find((statement) => statement.type === "ReturnStatement")
  const returnedValue =
    returnStatement?.type === "ReturnStatement" ? returnStatement.arguments[0] : undefined
  const root = requireTable(asAstObject(returnedValue), "returned value", configPath)
  const judgement = requireTable(getTableField(root, "judgment"), "judgment", configPath)
  const configured = readOptionalString(getTableField(judgement, guid), guid, configPath)
  const fallback = readRequiredString(
    getTableField(judgement, "default"),
    "judgment.default",
    configPath,
  )
  return { configured, fallback }
}

function parseAssetConfig(source: string, configPath: string): Chunk {
  try {
    return luaparse.parse(source, {
      encodingMode: "pseudo-latin1",
      luaVersion: "5.3",
    })
  } catch (cause) {
    throw new Error(`Could not parse Etterna asset configuration ${configPath}`, {
      cause,
    })
  }
}

function requireTable(value: AstObject | undefined, name: string, configPath: string): AstObject {
  if (value?.type !== "TableConstructorExpression") {
    throw new Error(`Expected ${name} to be a Lua table in ${configPath}`)
  }
  return value
}

function readRequiredString(
  value: AstObject | undefined,
  name: string,
  configPath: string,
): string {
  const result =
    value?.type === "StringLiteral"
      ? evaluateLuaString(value as unknown as Expression, {})
      : undefined
  if (!result) {
    throw new Error(`Expected ${name} to be a non-empty string in ${configPath}`)
  }
  return result
}

function readOptionalString(
  value: AstObject | undefined,
  name: string,
  configPath: string,
): string | undefined {
  if (!value) {
    return undefined
  }
  return readRequiredString(value, name, configPath)
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

function missingGuidDiagnostic(guid: string, fallback: string): Diagnostic {
  return {
    code: "etterna-judgement-default-used",
    severity: "warning",
    component: "judgements",
    message: `No judgement was configured for GUID ${guid}; using ${fallback}`,
  }
}

function missingFileDiagnostic(configured: string, fallback: string): Diagnostic {
  return {
    code: "etterna-judgement-file-missing",
    severity: "warning",
    component: "judgements",
    message: `Configured judgement ${configured} does not exist; using ${fallback}`,
  }
}
