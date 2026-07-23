import luaparse, { type Expression } from "luaparse"
import {
  type AstObject,
  asAstObject,
  getCallableName,
  getTableField,
  walkAst,
} from "../../../../infrastructure/lua/ast.ts"
import type { LuaStringVariables } from "../../../../infrastructure/lua/evaluate-expression.ts"
import { evaluateLuaString } from "../../../../infrastructure/lua/evaluate-expression.ts"
import type { ResolvedSkinAsset, SkinFileResolver } from "../resolve-skin-files.ts"

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
  walkAst(ast, (node) => {
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
