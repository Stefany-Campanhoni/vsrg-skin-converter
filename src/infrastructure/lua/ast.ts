import { readLuaStringLiteral } from "./evaluate-expression.ts"

export type AstObject = Record<string, unknown> & {
  type?: string
  range?: [number, number]
}

export function asAstObject(value: unknown): AstObject | undefined {
  return typeof value === "object" && value !== null ? (value as AstObject) : undefined
}

export function getMemberName(value: unknown): string | undefined {
  const member = asAstObject(value)
  const identifier = asAstObject(member?.identifier)
  return typeof identifier?.name === "string" ? identifier.name : undefined
}

export function getCallableName(value: unknown): string | undefined {
  const callable = asAstObject(value)
  const memberName = getMemberName(callable)
  if (memberName) {
    return memberName
  }
  return typeof callable?.name === "string" ? callable.name : undefined
}

export function getTableField(
  tableLike: AstObject | undefined,
  expectedName: string,
): AstObject | undefined {
  return findTableField(tableLike, (fieldName) => fieldName === expectedName)
}

export function getTableFieldCaseInsensitive(
  tableLike: AstObject | undefined,
  expectedName: string,
): AstObject | undefined {
  const normalizedExpectedName = expectedName.toLowerCase()
  return findTableField(
    tableLike,
    (fieldName) => fieldName.toLowerCase() === normalizedExpectedName,
  )
}

function findTableField(
  tableLike: AstObject | undefined,
  matches: (fieldName: string) => boolean,
): AstObject | undefined {
  const argumentTable = asAstObject(tableLike?.arguments)
  const rawFields = Array.isArray(tableLike?.fields)
    ? tableLike.fields
    : Array.isArray(argumentTable?.fields)
      ? argumentTable.fields
      : []

  for (let index = rawFields.length - 1; index >= 0; index -= 1) {
    const rawField = rawFields[index]
    const field = asAstObject(rawField)
    const key = asAstObject(field?.key)
    const identifierKey =
      field?.type === "TableKeyString" && typeof key?.name === "string" ? key.name : undefined
    const stringKey =
      field?.type === "TableKey" && key?.type === "StringLiteral"
        ? readLuaStringLiteral(key)
        : undefined

    if (
      (identifierKey !== undefined && matches(identifierKey)) ||
      (stringKey !== undefined && matches(stringKey))
    ) {
      return asAstObject(field?.value)
    }
  }
  return undefined
}

export function walkAst(value: unknown, visit: (node: AstObject) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkAst(item, visit)
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
      walkAst(child, visit)
    }
  }
}
