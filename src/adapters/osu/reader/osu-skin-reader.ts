import type { Dirent } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import type { SkinReader } from "../../../application/ports/skin-reader.ts"
import type { SkinModel, SkinReference } from "../../../domain/skin.ts"
import { resolveOsuPngAsset } from "../assets/resolve-osu-png-asset.ts"
import { readOsuComboScale } from "../fonts/read-osu-combo-scale.ts"
import { resolveOsuJudgementAsset } from "../judgements/resolve-osu-judgement-asset.ts"
import { readOsuSkinIniFile } from "../skin-ini/read-osu-skin-ini-file.ts"
import {
  type OsuSkinIniSource,
  type OsuSkinReaderDependencies,
  readOsuVisualSkinUsing,
} from "./osu-visual-skin-policy.ts"

export interface OsuSkinReaderConfiguration {
  readonly useDoubleResolutionAssets: boolean
  readonly scrollSpeed: number
}

export type { OsuSkinIniSource, OsuSkinReaderDependencies } from "./osu-visual-skin-policy.ts"

const defaultDependencies: OsuSkinReaderDependencies = {
  readSkinIni,
  resolveAsset: resolveOsuPngAsset,
  resolveJudgementAsset: resolveOsuJudgementAsset,
  readComboScale: readOsuComboScale,
}

export class OsuSkinReader implements SkinReader {
  readonly game = "osu"
  readonly #useDoubleResolutionAssets: boolean
  readonly #scrollSpeed: number
  readonly #dependencies: OsuSkinReaderDependencies

  constructor(
    configuration: OsuSkinReaderConfiguration,
    dependencies: OsuSkinReaderDependencies = defaultDependencies,
  ) {
    this.#useDoubleResolutionAssets = configuration.useDoubleResolutionAssets
    this.#scrollSpeed = configuration.scrollSpeed
    this.#dependencies = dependencies
  }

  async readSkin(reference: SkinReference): Promise<SkinModel> {
    const visual = await readOsuVisualSkinUsing(
      reference,
      this.#useDoubleResolutionAssets,
      this.#dependencies,
    )
    return { ...visual, playfield: { ...visual.playfield, scrollSpeed: this.#scrollSpeed } }
  }
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
    return { source: await readOsuSkinIniFile(filePath), filePath }
  } catch (cause) {
    throw new Error(`Could not read osu skin.ini ${filePath}`, { cause })
  }
}
