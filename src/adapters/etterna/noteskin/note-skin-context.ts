import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import luaparse from "luaparse"
import { type ColumnDirection, columnDirections } from "../../../domain/image.ts"
import {
  type AstObject,
  asAstObject,
  getMemberName,
  walkAst,
} from "../../../infrastructure/lua/ast.ts"
import { createSkinFileResolver, type SkinFileResolver } from "./resolve-skin-files.ts"

export interface NoteSkinContext {
  filePath: string
  source: string
  resolver: SkinFileResolver
  buttonRedirections: Partial<Record<ColumnDirection, string>>
  rotations: Partial<Record<ColumnDirection, number>>
  partsToRotate: Readonly<Record<string, boolean>>
  getFunctionSource(name: string): string | undefined
}

export const titleByDirection: Record<ColumnDirection, string> = {
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
): Partial<Record<ColumnDirection, string>> {
  return readDirectionTable(ast, tableName, (value) =>
    value.type === "StringLiteral" && typeof value.value === "string" ? value.value : undefined,
  )
}

function readDirectionNumberTable(
  ast: AstObject,
  tableName: string,
): Partial<Record<ColumnDirection, number>> {
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
): Partial<Record<ColumnDirection, T>> {
  const result: Partial<Record<ColumnDirection, T>> = {}
  const table = findAssignedTable(ast, tableName)
  for (const field of getTableFields(table)) {
    const direction = getTableKey(field)?.toLowerCase() as ColumnDirection | undefined
    const value = asAstObject(field.value)
    const parsed = value ? readValue(value) : undefined
    if (direction && columnDirections.includes(direction) && parsed !== undefined) {
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
  walkAst(ast, (node) => {
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
  walkAst(ast, (node) => {
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
