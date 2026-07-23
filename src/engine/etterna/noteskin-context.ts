import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import luaparse from "luaparse"
import { type Direction, receptorDirections } from "../receptor.ts"
import { createSkinFileResolver, type SkinFileResolver } from "./receptors/resolve-files.ts"

type AstObject = Record<string, unknown> & { type?: string; range?: [number, number] }

export interface NoteSkinContext {
  filePath: string
  source: string
  resolver: SkinFileResolver
  buttonRedirections: Partial<Record<Direction, string>>
  rotations: Partial<Record<Direction, number>>
  partsToRotate: Readonly<Record<string, boolean>>
  getFunctionSource(name: string): string | undefined
}

export const titleByDirection: Record<Direction, string> = {
  left: "Left",
  down: "Down",
  up: "Up",
  right: "Right",
}

export async function loadNoteSkinContext(skinDirectory: string): Promise<NoteSkinContext> {
  const filePath = await findNoteSkinFile(skinDirectory)
  const source = await readFile(filePath, "utf8")
  const ast = luaparse.parse(source, {
    ranges: true,
    encodingMode: "pseudo-latin1",
  }) as unknown as AstObject

  return {
    filePath,
    source,
    resolver: await createSkinFileResolver(skinDirectory),
    buttonRedirections: {
      ...readDirectionStringTable(ast, "RedirTable"),
      ...readDirectionStringTable(ast, "ButtonRedir"),
    },
    rotations: readDirectionNumberTable(ast, "Rotate"),
    partsToRotate: readBooleanTable(ast, "PartsToRotate"),
    getFunctionSource(name: string): string | undefined {
      return getNamedFunctionSource(ast, source, name)
    },
  }
}

export function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360
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
  const table = findAssignedTable(ast, tableName)
  for (const field of getTableFields(table)) {
    const direction = getTableKey(field)?.toLowerCase() as Direction | undefined
    const value = asAstObject(field.value)
    const parsed = value ? readValue(value) : undefined
    if (direction && receptorDirections.includes(direction) && parsed !== undefined) {
      result[direction] = parsed
    }
  }
  return result
}

function readBooleanTable(ast: AstObject, tableName: string): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  const table = findAssignedTable(ast, tableName)
  for (const field of getTableFields(table)) {
    const key = getTableKey(field)
    const value = asAstObject(field.value)
    if (key && value?.type === "BooleanLiteral" && typeof value.value === "boolean") {
      result[key] = value.value
    }
  }
  return result
}

function findAssignedTable(ast: AstObject, tableName: string): AstObject | undefined {
  let result: AstObject | undefined
  walk(ast, (node) => {
    if (result || node.type !== "AssignmentStatement") {
      return
    }
    const variables = Array.isArray(node.variables) ? node.variables : []
    const init = Array.isArray(node.init) ? node.init : []
    if (getMemberName(variables[0]) === tableName) {
      result = asAstObject(init[0])
    }
  })
  return result
}

function getTableFields(table: AstObject | undefined): AstObject[] {
  return (Array.isArray(table?.fields) ? table.fields : [])
    .map(asAstObject)
    .filter((field): field is AstObject => field !== undefined)
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
    const name = typeof identifier?.name === "string" ? identifier.name : getMemberName(identifier)
    if (name === expectedName && node.range) {
      result = source.slice(node.range[0], node.range[1])
    }
  })
  return result
}

function getTableKey(field: AstObject): string | undefined {
  const key = asAstObject(field.key)
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
