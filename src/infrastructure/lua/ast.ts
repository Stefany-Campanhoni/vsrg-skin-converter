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
  tableCall: AstObject | undefined,
  expectedName: string,
): AstObject | undefined {
  const table = asAstObject(tableCall?.arguments)
  const fields = Array.isArray(table?.fields) ? table.fields : []
  for (const rawField of fields) {
    const field = asAstObject(rawField)
    const key = asAstObject(field?.key)
    if (field?.type === "TableKeyString" && key?.name === expectedName) {
      return asAstObject(field.value)
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
