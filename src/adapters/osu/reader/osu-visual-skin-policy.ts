import { columnDirections, type ImageAsset } from "../../../domain/image.ts"
import { type JudgementSet, judgementGrades } from "../../../domain/judgement.ts"
import type { SkinReference } from "../../../domain/skin.ts"
import type { VisualSkinModel } from "../../../domain/visual-skin.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { sourceBasename } from "../../../infrastructure/filesystem/source-relative-path.ts"
import {
  OsuPngAssetNotFoundError,
  type ResolveOsuPngAssetOptions,
} from "../assets/osu-png-policy.ts"
import type { ReadOsuComboScaleOptions } from "../fonts/osu-combo-scale-policy.ts"
import { osuJudgementDefinitions } from "../judgements/osu-judgement-definitions.ts"
import type { ResolveOsuJudgementAssetOptions } from "../judgements/osu-judgement-policy.ts"
import {
  type OsuMania4kDefinition,
  parseOsuSkinIni,
  readOsuComboPrefix,
  readOsuMania4kDefinition,
  readOsuSkinName,
} from "../skin-ini/osu-skin-ini.ts"

export interface OsuSkinIniSource {
  readonly source: string
  readonly filePath: string
}

export interface OsuSkinReaderDependencies {
  readSkinIni(skinDirectory: string): Promise<OsuSkinIniSource>
  resolveAsset(options: ResolveOsuPngAssetOptions): Promise<ImageAsset>
  resolveJudgementAsset(options: ResolveOsuJudgementAssetOptions): Promise<ImageAsset>
  readComboScale(options: ReadOsuComboScaleOptions): Promise<number>
}

export async function readOsuVisualSkinUsing(
  reference: SkinReference,
  useDoubleResolutionAssets: boolean,
  dependencies: OsuSkinReaderDependencies,
): Promise<VisualSkinModel> {
  if (reference.game !== "osu") {
    throw new Error(`osu reader cannot read a ${reference.game} skin`)
  }

  const ini = await dependencies.readSkinIni(reference.sourcePath)
  let name: string
  let comboPrefix: string
  let mania: OsuMania4kDefinition
  try {
    const sections = parseOsuSkinIni(ini.source, ini.filePath)
    name = readOsuSkinName(sections) ?? sourceBasename(reference.sourcePath)
    comboPrefix = readOsuComboPrefix(sections, ini.filePath)
    mania = readOsuMania4kDefinition(sections, ini.filePath)
  } catch (cause) {
    throw new Error(`Could not parse osu skin.ini ${ini.filePath}`, { cause })
  }
  const references = columnDirections.flatMap((direction, index) => [
    {
      property: `receptors.${direction}.normal`,
      logicalPath: tupleValue(mania.normalReceptors, index),
    },
    {
      property: `receptors.${direction}.pressed`,
      logicalPath: tupleValue(mania.pressedReceptors, index),
    },
  ])
  references.push(
    ...columnDirections.map((direction, index) => ({
      property: `tapNotes.${direction}`,
      logicalPath: tupleValue(mania.tapNotes, index),
    })),
  )
  const assetTasks = [
    ...references.map(({ property, logicalPath }) =>
      invokeAsPromise(async () => {
        try {
          return await dependencies.resolveAsset({
            skinDirectory: reference.sourcePath,
            logicalPath,
            useDoubleResolutionAssets: useDoubleResolutionAssets,
            fallbackToStandardResolution: true,
          })
        } catch (cause) {
          throw new Error(`Could not resolve osu skin asset ${property} ('${logicalPath}')`, {
            cause,
          })
        }
      }),
    ),
    ...judgementGrades.map((grade) =>
      invokeAsPromise(async () => {
        const logicalPath = mania.judgements[grade]
        try {
          return await dependencies.resolveJudgementAsset({
            skinDirectory: reference.sourcePath,
            logicalPath,
            defaultFileName: osuJudgementDefinitions[grade].defaultFileName,
            useDoubleResolutionAssets: useDoubleResolutionAssets,
          })
        } catch (cause) {
          if (isMissingOsuPngAsset(cause)) return undefined
          const referenceDescription = logicalPath ? ` ('${logicalPath}')` : ""
          throw new Error(
            `Could not resolve osu skin asset judgements.${grade}${referenceDescription}`,
            { cause },
          )
        }
      }),
    ),
  ]
  const [assets, comboScale] = await settleAll([
    settleAll(assetTasks),
    invokeAsPromise(() =>
      dependencies.readComboScale({
        skinDirectory: reference.sourcePath,
        comboPrefix,
        useDoubleResolutionAssets: useDoubleResolutionAssets,
      }),
    ),
  ])

  const leftNormal = requiredAsset(assets[0], 0)
  const leftPressed = requiredAsset(assets[1], 1)
  const downNormal = requiredAsset(assets[2], 2)
  const downPressed = requiredAsset(assets[3], 3)
  const upNormal = requiredAsset(assets[4], 4)
  const upPressed = requiredAsset(assets[5], 5)
  const rightNormal = requiredAsset(assets[6], 6)
  const rightPressed = requiredAsset(assets[7], 7)
  const leftNote = requiredAsset(assets[8], 8)
  const downNote = requiredAsset(assets[9], 9)
  const upNote = requiredAsset(assets[10], 10)
  const rightNote = requiredAsset(assets[11], 11)
  const judgementImages = Object.fromEntries(
    judgementGrades.flatMap((grade, gradeIndex) => {
      const asset = assets[12 + gradeIndex]
      return asset ? [[grade, asset] as const] : []
    }),
  ) as JudgementSet["images"]
  const judgements: JudgementSet = {
    sourceDensity: getJudgementSourceDensity(judgementImages, useDoubleResolutionAssets ? 2 : 1),
    images: judgementImages,
  }

  return {
    game: "osu",
    metadata: { name },
    playfield: {
      hitPosition: mania.hitPosition,
      comboPosition: mania.comboPosition,
      judgementPosition: mania.judgementPosition,
      columnWidth:
        mania.columnWidths.reduce((total, width) => total + width, 0) / mania.columnWidths.length,
      comboScale,
      judgementScale: 1,
      isDownscroll: mania.isDownscroll,
    },
    assets: {
      receptors: {
        left: { normal: leftNormal, pressed: leftPressed },
        down: { normal: downNormal, pressed: downPressed },
        up: { normal: upNormal, pressed: upPressed },
        right: { normal: rightNormal, pressed: rightPressed },
      },
      tapNotes: {
        left: leftNote,
        down: downNote,
        up: upNote,
        right: rightNote,
      },
      judgements,
    },
    diagnostics: [],
  }
}
function getJudgementSourceDensity(images: JudgementSet["images"], selectedDensity: 1 | 2): 1 | 2 {
  for (const [grade, image] of Object.entries(images)) {
    if (!image.pixelDensity) {
      throw new Error(`Missing osu judgement pixel density for ${grade} from '${image.filePath}'`)
    }
  }

  const densities = new Set(Object.values(images).map((image) => image.pixelDensity))
  if (densities.size > 1) {
    throw new Error("Mixed osu judgement pixel densities are not supported")
  }
  if (densities.size === 0) return selectedDensity
  return densities.has("double") ? 2 : 1
}

function isMissingOsuPngAsset(cause: unknown): boolean {
  const visited = new Set<unknown>()
  let current = cause
  while (current instanceof Error && !visited.has(current)) {
    if (current instanceof OsuPngAssetNotFoundError) return true
    visited.add(current)
    current = current.cause
  }
  return false
}

function tupleValue(values: readonly [string, string, string, string], index: number): string {
  const value = values[index]
  if (value === undefined) {
    throw new Error(`Invalid osu 4K column index ${index}`)
  }
  return value
}

function requiredAsset(asset: ImageAsset | undefined, index: number): ImageAsset {
  if (!asset) {
    throw new Error(`Missing resolved osu skin asset at index ${index}`)
  }
  return asset
}
