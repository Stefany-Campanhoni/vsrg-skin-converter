import type { Dirent } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { SkinReader } from "../../../application/ports/skin-reader.ts"
import { columnDirections, type ImageAsset } from "../../../domain/image.ts"
import {
  type JudgementGrade,
  type JudgementSet,
  judgementGrades,
} from "../../../domain/judgement.ts"
import type { SkinModel, SkinReference } from "../../../domain/skin.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  type ResolveOsuPngAssetOptions,
  resolveOsuPngAsset,
} from "../assets/resolve-osu-png-asset.ts"
import {
  type OsuMania4kDefinition,
  parseOsuSkinIni,
  readOsuMania4kDefinition,
  readOsuSkinName,
} from "../skin-ini/osu-skin-ini.ts"

export interface OsuSkinReaderConfiguration {
  readonly useDoubleResolutionAssets: boolean
}

export interface OsuSkinIniSource {
  readonly source: string
  readonly filePath: string
}

export interface OsuSkinReaderDependencies {
  readSkinIni(skinDirectory: string): Promise<OsuSkinIniSource>
  resolveAsset(options: ResolveOsuPngAssetOptions): Promise<ImageAsset>
}

const defaultDependencies: OsuSkinReaderDependencies = {
  readSkinIni,
  resolveAsset: resolveOsuPngAsset,
}

export class OsuSkinReader implements SkinReader {
  readonly game = "osu"
  readonly #useDoubleResolutionAssets: boolean
  readonly #dependencies: OsuSkinReaderDependencies

  constructor(
    configuration: OsuSkinReaderConfiguration,
    dependencies: OsuSkinReaderDependencies = defaultDependencies,
  ) {
    this.#useDoubleResolutionAssets = configuration.useDoubleResolutionAssets
    this.#dependencies = dependencies
  }

  async readSkin(reference: SkinReference): Promise<SkinModel> {
    if (reference.game !== this.game) {
      throw new Error(`osu reader cannot read a ${reference.game} skin`)
    }

    const ini = await this.#dependencies.readSkinIni(reference.sourcePath)
    let name: string
    let mania: OsuMania4kDefinition
    try {
      const sections = parseOsuSkinIni(ini.source, ini.filePath)
      name = readOsuSkinName(sections, ini.filePath)
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
    references.push(
      ...judgementGrades.map((grade) => ({
        property: `judgements.${grade}`,
        logicalPath: mania.judgements[grade],
      })),
    )

    const assets = await settleAll(
      references.map(({ property, logicalPath }) =>
        invokeAsPromise(async () => {
          try {
            return await this.#dependencies.resolveAsset({
              skinDirectory: reference.sourcePath,
              logicalPath,
              useDoubleResolutionAssets: this.#useDoubleResolutionAssets,
            })
          } catch (cause) {
            throw new Error(`Could not resolve osu skin asset ${property} ('${logicalPath}')`, {
              cause,
            })
          }
        }),
      ),
    )

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
      judgementGrades.map((grade, gradeIndex) => [
        grade,
        requiredAsset(assets[12 + gradeIndex], 12 + gradeIndex),
      ]),
    ) as Record<JudgementGrade, ImageAsset>
    const judgements: JudgementSet = {
      sourceDensity: getJudgementSourceDensity(judgementImages),
      images: judgementImages,
    }

    return {
      game: this.game,
      metadata: { name },
      playfield: {
        hitPosition: mania.hitPosition,
        comboPosition: mania.comboPosition,
        judgementPosition: mania.judgementPosition,
        columnWidth:
          mania.columnWidths.reduce((total, width) => total + width, 0) / mania.columnWidths.length,
        comboScale: 1,
        judgementScale: 1,
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
}

function getJudgementSourceDensity(images: Readonly<Record<JudgementGrade, ImageAsset>>): 1 | 2 {
  for (const grade of judgementGrades) {
    if (!images[grade].pixelDensity) {
      throw new Error(
        `Missing osu judgement pixel density for ${grade} from '${images[grade].filePath}'`,
      )
    }
  }

  const densities = new Set(judgementGrades.map((grade) => images[grade].pixelDensity))
  if (densities.size !== 1) {
    throw new Error("Mixed osu judgement pixel densities are not supported")
  }
  return densities.has("double") ? 2 : 1
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

async function readSkinIni(skinDirectory: string): Promise<OsuSkinIniSource> {
  let entries: Dirent[]
  try {
    entries = await readdir(skinDirectory, { withFileTypes: true })
  } catch (cause) {
    throw new Error(`Could not list osu skin directory ${skinDirectory}`, { cause })
  }

  const matches = entries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase() === "skin.ini",
  )
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one skin.ini in ${skinDirectory}`)
  }

  const filePath = path.join(skinDirectory, matches[0]?.name ?? "skin.ini")
  try {
    return { source: await readFile(filePath, "utf8"), filePath }
  } catch (cause) {
    throw new Error(`Could not read osu skin.ini ${filePath}`, { cause })
  }
}
