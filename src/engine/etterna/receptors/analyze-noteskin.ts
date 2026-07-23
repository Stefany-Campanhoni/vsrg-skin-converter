import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import luaparse from "luaparse"
import {
  type Direction,
  type ReceptorSet,
  type ResolvedReceptor,
  receptorDirections,
} from "../../receptor.ts"
import { analyzeReceptorLua } from "./analyze-receptor.ts"
import { createSkinFileResolver } from "./resolve-files.ts"

type AstObject = Record<string, unknown> & { type?: string; range?: [number, number] }

export interface EtternaReceptorAnalysis {
  receptors: ReceptorSet
  warnings: string[]
}

const titleByDirection: Record<Direction, string> = {
  left: "Left",
  down: "Down",
  up: "Up",
  right: "Right",
}

export async function analyzeEtternaReceptors(
  skinDirectory: string,
): Promise<EtternaReceptorAnalysis> {
  const noteSkinPath = await findNoteSkinFile(skinDirectory)
  const source = await readFile(noteSkinPath, "utf8")
  const ast = luaparse.parse(source, {
    ranges: true,
    encodingMode: "pseudo-latin1",
  }) as unknown as AstObject
  const buttonRedirections = {
    ...readDirectionStringTable(ast, "RedirTable"),
    ...readDirectionStringTable(ast, "ButtonRedir"),
  }
  const rotations = readDirectionNumberTable(ast, "Rotate")
  const inlineReceptorSource = getNamedFunctionSource(ast, source, "createReceptor")
  const resolver = await createSkinFileResolver(skinDirectory)
  const receptors = {} as Record<Direction, ResolvedReceptor>
  const warnings: string[] = []

  for (const direction of receptorDirections) {
    const title = titleByDirection[direction]
    const redirectedTitle = buttonRedirections[direction] ?? title
    const redirectedDirection = redirectedTitle.toLowerCase() as Direction
    const rotation = normalizeRotation(rotations[direction] ?? 0)
    let inlineError: unknown

    if (inlineReceptorSource) {
      try {
        const analysis = analyzeReceptorLua({
          source: inlineReceptorSource,
          filePath: noteSkinPath,
          direction,
          variables: {
            direction: title,
            Button: redirectedTitle,
            sButton: title,
            Element: "Receptor",
            sElement: "Receptor",
          },
          resolver,
          rotation,
        })
        receptors[direction] = analysis.receptor
        warnings.push(...analysis.warnings.map((warning) => `[${direction}] ${warning}`))
        continue
      } catch (error) {
        inlineError = error
      }
    }

    const receptorLuaPath = await resolver.resolveReceptorLua(redirectedDirection)
    if (!receptorLuaPath) {
      const inlineDiagnostic =
        inlineError instanceof Error ? ` Inline analysis: ${inlineError.message}` : ""
      throw new Error(
        `Could not resolve a receptor Lua file for direction ${direction}.${inlineDiagnostic}`,
      )
    }

    try {
      const analysis = analyzeReceptorLua({
        source: await readFile(receptorLuaPath, "utf8"),
        filePath: receptorLuaPath,
        direction,
        variables: {
          direction: redirectedTitle,
          Button: redirectedTitle,
          sButton: title,
          Element: "Receptor",
          sElement: "Receptor",
        },
        resolver,
        rotation,
      })
      receptors[direction] = analysis.receptor
      warnings.push(...analysis.warnings.map((warning) => `[${direction}] ${warning}`))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to analyze receptor for direction ${direction}: ${message}`, {
        cause: error,
      })
    }
  }

  return { receptors, warnings }
}

async function findNoteSkinFile(skinDirectory: string): Promise<string> {
  const entries = await readdir(skinDirectory, { withFileTypes: true })
  const noteSkin = entries.find(
    (entry) => entry.isFile() && entry.name.toLowerCase() === "noteskin.lua",
  )
  if (!noteSkin) {
    throw new Error(`NoteSkin.lua was not found in ${skinDirectory}`)
  }
  return path.join(skinDirectory, noteSkin.name)
}

function readDirectionStringTable(
  ast: AstObject,
  tableName: string,
): Partial<Record<Direction, string>> {
  return readDirectionTable(ast, tableName, (value) =>
    value.type === "StringLiteral" && typeof value.value === "string" ? value.value : undefined,
  )
}

function readDirectionNumberTable(
  ast: AstObject,
  tableName: string,
): Partial<Record<Direction, number>> {
  return readDirectionTable(ast, tableName, (value) =>
    value.type === "NumericLiteral" && typeof value.value === "number"
      ? value.value
      : value.type === "UnaryExpression" &&
          value.operator === "-" &&
          asAstObject(value.argument)?.type === "NumericLiteral"
        ? -Number(asAstObject(value.argument)?.value)
        : undefined,
  )
}

function readDirectionTable<T>(
  ast: AstObject,
  tableName: string,
  readValue: (value: AstObject) => T | undefined,
): Partial<Record<Direction, T>> {
  const result: Partial<Record<Direction, T>> = {}
  walk(ast, (node) => {
    if (node.type !== "AssignmentStatement") {
      return
    }
    const variables = Array.isArray(node.variables) ? node.variables : []
    const init = Array.isArray(node.init) ? node.init : []
    if (getMemberName(variables[0]) !== tableName) {
      return
    }

    const table = asAstObject(init[0])
    const fields = Array.isArray(table?.fields) ? table.fields : []
    for (const rawField of fields) {
      const field = asAstObject(rawField)
      const key = getTableKey(field)
      const value = asAstObject(field?.value)
      const direction = key?.toLowerCase() as Direction | undefined
      const parsed = value ? readValue(value) : undefined
      if (direction && receptorDirections.includes(direction) && parsed !== undefined) {
        result[direction] = parsed
      }
    }
  })
  return result
}

function getNamedFunctionSource(
  ast: AstObject,
  source: string,
  expectedName: string,
): string | undefined {
  let result: string | undefined
  walk(ast, (node) => {
    if (result || node.type !== "FunctionDeclaration") {
      return
    }
    const identifier = asAstObject(node.identifier)
    if (identifier?.name === expectedName && node.range) {
      result = source.slice(node.range[0], node.range[1])
    }
  })
  return result
}

function getTableKey(field: AstObject | undefined): string | undefined {
  const key = asAstObject(field?.key)
  if (typeof key?.name === "string") {
    return key.name
  }
  return key?.type === "StringLiteral" && typeof key.value === "string" ? key.value : undefined
}

function getMemberName(value: unknown): string | undefined {
  const member = asAstObject(value)
  const identifier = asAstObject(member?.identifier)
  return typeof identifier?.name === "string" ? identifier.name : undefined
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360
}

function walk(value: unknown, visit: (node: AstObject) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visit)
    }
    return
  }
  const node = asAstObject(value)
  if (!node) {
    return
  }
  if (typeof node.type === "string") {
    visit(node)
  }
  for (const [key, child] of Object.entries(node)) {
    if (key !== "loc" && key !== "range") {
      walk(child, visit)
    }
  }
}

function asAstObject(value: unknown): AstObject | undefined {
  return typeof value === "object" && value !== null ? (value as AstObject) : undefined
}
