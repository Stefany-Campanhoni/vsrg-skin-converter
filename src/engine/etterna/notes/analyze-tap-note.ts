import luaparse, { type Expression } from "luaparse"
import type { LuaStringVariables } from "../receptors/evaluate-expression.ts"
import { evaluateLuaString } from "../receptors/evaluate-expression.ts"
import type { ResolvedSkinAsset, SkinFileResolver } from "../receptors/resolve-files.ts"

type AstObject = Record<string, unknown> & { type?: string }

export interface AnalyzeTapNoteOptions {
  source: string
  filePath: string
  variables: LuaStringVariables
  resolver: SkinFileResolver
}

export interface TapNoteTextureAnalysis {
  asset: ResolvedSkinAsset
  warnings: string[]
}

export function analyzeTapNoteLua(options: AnalyzeTapNoteOptions): TapNoteTextureAnalysis {
  const ast = luaparse.parse(options.source, {
    encodingMode: "pseudo-latin1",
  }) as unknown as AstObject
  const assets = collectSpriteTextures(ast, options)
  const uniqueAssets = [
    ...new Map(assets.map((asset) => [asset.filePath.toLowerCase(), asset])).values(),
  ]
  const selected = uniqueAssets[0]

  if (!selected) {
    throw new Error(`Could not identify a tap-note texture in ${options.filePath}`)
  }

  const warnings =
    uniqueAssets.length > 1
      ? [
          `Selected tap-note texture ${selected.filePath}; alternatives: ${uniqueAssets
            .slice(1)
            .map((asset) => asset.filePath)
            .join(", ")}`,
        ]
      : []

  return { asset: selected, warnings }
}

function collectSpriteTextures(
  ast: AstObject,
  options: AnalyzeTapNoteOptions,
): ResolvedSkinAsset[] {
  const assets: ResolvedSkinAsset[] = []
  walk(ast, (node) => {
    if (node.type === "TableCallExpression" && getCallableName(node.base) === "Sprite") {
      const texture = getTableField(node, "Texture")
      if (texture) {
        assets.push(...resolveTexture(texture, options.variables, options.resolver))
      }
    }

    if (node.type === "CallExpression" && getCallableName(node.base) === "LoadActor") {
      const args = Array.isArray(node.arguments) ? node.arguments : []
      const actorPath = asAstObject(args[0])
      if (actorPath) {
        assets.push(...resolveTexture(actorPath, options.variables, options.resolver))
      }
    }
  })
  return assets
}

function resolveTexture(
  texture: AstObject,
  variables: LuaStringVariables,
  resolver: SkinFileResolver,
): ResolvedSkinAsset[] {
  if (texture.type === "CallExpression" && getCallableName(texture.base) === "GetPath") {
    const args = Array.isArray(texture.arguments) ? texture.arguments : []
    const logicalParts = args
      .map((argument) => evaluateLuaString(argument as Expression, variables))
      .filter((value): value is string => value !== undefined)

    if (logicalParts.length !== args.length || logicalParts.length === 0) {
      return []
    }

    const direct = resolver.resolveAssets(...logicalParts)
    if (direct.length > 0 || logicalParts[0]?.startsWith("_")) {
      return direct
    }
    return resolver.resolveAssets(`_${logicalParts[0]}`, ...logicalParts.slice(1))
  }

  const logicalName = evaluateLuaString(texture as unknown as Expression, variables)
  return logicalName === undefined ? [] : resolver.resolveAssets(logicalName)
}

function getTableField(sprite: AstObject, expectedName: string): AstObject | undefined {
  const table = asAstObject(sprite.arguments)
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

function getCallableName(value: unknown): string | undefined {
  const callable = asAstObject(value)
  const identifier = asAstObject(callable?.identifier)
  if (typeof identifier?.name === "string") {
    return identifier.name
  }
  return typeof callable?.name === "string" ? callable.name : undefined
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
  for (const child of Object.values(node)) {
    walk(child, visit)
  }
}

function asAstObject(value: unknown): AstObject | undefined {
  return typeof value === "object" && value !== null ? (value as AstObject) : undefined
}
