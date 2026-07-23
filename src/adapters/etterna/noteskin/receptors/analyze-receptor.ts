import path from "node:path"
import luaparse, { type Expression } from "luaparse"
import type {
  ColumnDirection,
  ReceptorSet,
  ReceptorState,
  SpriteFrame,
} from "../../../../domain/image.ts"
import {
  type AstObject,
  asAstObject,
  getMemberName,
  walkAst,
} from "../../../../infrastructure/lua/ast.ts"
import {
  evaluateLuaString,
  type LuaStringVariables,
} from "../../../../infrastructure/lua/evaluate-expression.ts"
import type { ResolvedSkinAsset, SkinFileResolver } from "../resolve-skin-files.ts"
import type { ReceptorCandidate } from "./select-receptor-candidate.ts"
import { selectCandidate } from "./select-receptor-candidate.ts"

export interface AnalyzeReceptorOptions {
  source: string
  filePath: string
  direction: ColumnDirection
  variables: LuaStringVariables
  resolver: SkinFileResolver
  rotation: number
}

export interface ReceptorAnalysis {
  receptor: ReceptorSet[ColumnDirection]
  warnings: string[]
}

export function analyzeReceptorLua(options: AnalyzeReceptorOptions): ReceptorAnalysis {
  const ast = luaparse.parse(options.source, {
    ranges: true,
    encodingMode: "pseudo-latin1",
  })
  const sprites = collectSpriteTables(ast as unknown as AstObject)
  const candidates = sprites.flatMap((sprite) => analyzeSprite(sprite, options))

  if (sprites.length === 1) {
    addLoneSpritesheetCandidates(sprites[0], candidates, options)
  }

  const normal = selectCandidate(
    "normal",
    candidates.filter((candidate) => candidate.state === "normal"),
    options.filePath,
  )
  const pressed = selectCandidate(
    "pressed",
    candidates.filter((candidate) => candidate.state === "pressed"),
    options.filePath,
  )

  return {
    receptor: {
      normal: normal.image,
      pressed: pressed.image,
    },
    warnings: [normal.warning, pressed.warning].filter(
      (warning): warning is string => warning !== undefined,
    ),
  }
}

function analyzeSprite(sprite: AstObject, options: AnalyzeReceptorOptions): ReceptorCandidate[] {
  const fields = getTableFields(sprite)
  const texture = fields.get("Texture")
  if (!texture) {
    return []
  }

  const resolved = resolveTexture(texture, options.variables, options.resolver)
  if (!resolved) {
    return []
  }

  const commandState = inferVisibilityState(fields)
  const isOverlay = containsString(sprite, "ReceptorOverlay")
  const semanticState = inferSemanticState(resolved.logicalName)
  const state = commandState ?? (isOverlay ? "pressed" : (semanticState ?? "normal"))

  const evidence =
    commandState !== undefined
      ? ["explicit visibility transition"]
      : isOverlay
        ? ["ReceptorOverlay command"]
        : semanticState
          ? ["semantic texture name"]
          : ["filename-only fallback"]
  const score = commandState !== undefined ? 500 : isOverlay ? 400 : semanticState ? 300 : 100

  return resolved.assets.map((asset) =>
    createCandidate(asset, state, score, evidence, options.rotation, getDeclaredFrame(fields)),
  )
}

function addLoneSpritesheetCandidates(
  sprite: AstObject | undefined,
  candidates: ReceptorCandidate[],
  options: AnalyzeReceptorOptions,
): void {
  if (!sprite) {
    return
  }

  const fields = getTableFields(sprite)
  const texture = fields.get("Texture")
  if (!texture) {
    return
  }

  const resolved = resolveTexture(texture, options.variables, options.resolver)
  const asset = resolved?.assets.find(({ columns, rows }) => columns * rows >= 2)
  if (!asset) {
    return
  }

  const totalFrames = asset.columns * asset.rows
  candidates.push(
    createCandidate(asset, "normal", 200, ["spritesheet frame metadata"], options.rotation, 0),
    createCandidate(
      asset,
      "pressed",
      200,
      ["spritesheet frame metadata"],
      options.rotation,
      Math.min(1, totalFrames - 1),
    ),
  )
}

function createCandidate(
  asset: ResolvedSkinAsset,
  state: ReceptorState,
  score: number,
  evidence: string[],
  rotation: number,
  frameIndex?: number,
): ReceptorCandidate {
  const frame: SpriteFrame | undefined =
    asset.columns * asset.rows > 1
      ? {
          index: frameIndex ?? 0,
          columns: asset.columns,
          rows: asset.rows,
        }
      : undefined

  return {
    state,
    filePath: asset.filePath,
    rotation,
    score,
    evidence,
    ...(frame ? { frame } : {}),
  }
}

function resolveTexture(
  texture: AstObject,
  variables: LuaStringVariables,
  resolver: SkinFileResolver,
): { assets: ResolvedSkinAsset[]; logicalName: string } | undefined {
  if (texture.type === "CallExpression" && getMemberName(texture.base) === "GetPath") {
    const args = Array.isArray(texture.arguments) ? texture.arguments : []
    const logicalParts = args
      .map((argument) => evaluateLuaString(argument as Expression, variables))
      .filter((value): value is string => value !== undefined)

    if (logicalParts.length !== args.length || logicalParts.length === 0) {
      return undefined
    }

    return {
      assets: resolver.resolveAssets(...logicalParts),
      logicalName: logicalParts.join(" "),
    }
  }

  const logicalName = evaluateLuaString(texture as unknown as Expression, variables)
  if (logicalName === undefined) {
    return undefined
  }

  return {
    assets: resolver.resolveAssets(logicalName),
    logicalName,
  }
}

function collectSpriteTables(root: AstObject): AstObject[] {
  const sprites: AstObject[] = []
  walkAst(root, (node) => {
    if (node.type === "TableCallExpression" && getMemberName(node.base) === "Sprite") {
      sprites.push(node)
    }
  })
  return sprites
}

function getTableFields(sprite: AstObject): Map<string, AstObject> {
  const table = asAstObject(sprite.arguments)
  const fields = Array.isArray(table?.fields) ? table.fields : []
  const result = new Map<string, AstObject>()

  for (const rawField of fields) {
    const field = asAstObject(rawField)
    const key = asAstObject(field?.key)
    const value = asAstObject(field?.value)
    if (field?.type === "TableKeyString" && typeof key?.name === "string" && value) {
      result.set(key.name, value)
    }
  }

  return result
}

function inferVisibilityState(fields: Map<string, AstObject>): ReceptorState | undefined {
  const press = fields.get("PressCommand")
  const lift = fields.get("LiftCommand")
  const pressVisible = press ? findVisibleBoolean(press) : undefined
  const liftVisible = lift ? findVisibleBoolean(lift) : undefined

  if (pressVisible === true && liftVisible === false) {
    return "pressed"
  }
  if (pressVisible === false && liftVisible === true) {
    return "normal"
  }
  return undefined
}

function findVisibleBoolean(root: AstObject): boolean | undefined {
  let result: boolean | undefined
  walkAst(root, (node) => {
    if (result !== undefined || node.type !== "CallExpression") {
      return
    }
    if (getMemberName(node.base)?.toLowerCase() !== "visible") {
      return
    }
    const argument = Array.isArray(node.arguments) ? asAstObject(node.arguments[0]) : undefined
    if (argument?.type === "BooleanLiteral" && typeof argument.value === "boolean") {
      result = argument.value
    }
  })
  return result
}

function getDeclaredFrame(fields: Map<string, AstObject>): number | undefined {
  const value = fields.get("Frame0000")
  return value?.type === "NumericLiteral" && typeof value.value === "number"
    ? value.value
    : undefined
}

function inferSemanticState(value: string): ReceptorState | undefined {
  const name = path.basename(value).toLowerCase()
  if (/(?:press|pressed|overlay|flash)/i.test(name)) {
    return "pressed"
  }
  if (/(?:release|normal|go receptor|receptor go)/i.test(name)) {
    return "normal"
  }
  return undefined
}

function containsString(root: AstObject, expected: string): boolean {
  let found = false
  walkAst(root, (node) => {
    if (node.type === "StringLiteral" && node.value === expected) {
      found = true
    }
  })
  return found
}
