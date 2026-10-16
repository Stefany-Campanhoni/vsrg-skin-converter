import type { ImageDimensions } from "../../../application/ports/image-operations.ts"
export interface OsuComboDependencies {
  resolveOsuPngAsset(options: ResolveOsuPngAssetOptions): Promise<ImageAsset>
  readImageDimensions(id: string): Promise<ImageDimensions>
}

import type { ImageAsset } from "../../../domain/image.ts"
import { invokeAsPromise } from "../../../infrastructure/async/settle-all.ts"
import {
  OsuPngAssetNotFoundError,
  type ResolveOsuPngAssetOptions,
} from "../assets/osu-png-policy.ts"

const osuComboDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const
const osuComboTemplateLogicalHeight = 42

export interface ReadOsuComboScaleOptions {
  readonly skinDirectory: string
  readonly comboPrefix: string
  readonly useDoubleResolutionAssets: boolean
}

interface ComboDigitScale {
  readonly scale: number
  readonly pixelStep: number
}

export async function readOsuComboScaleUsing(
  options: ReadOsuComboScaleOptions,
  dependencies: OsuComboDependencies,
): Promise<number> {
  const results = await Promise.allSettled(
    osuComboDigits.map((digit) =>
      invokeAsPromise(() => readComboDigitScale(options, digit, dependencies)),
    ),
  )
  const failures = results.filter((result) => result.status === "rejected")
  const fatalFailure = failures.find((result) => !isMissingComboDigit(result.reason))
  if (fatalFailure) {
    throw fatalFailure.reason
  }
  const digitScales = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  )
  const scales = digitScales.map(({ scale }) => scale).sort((left, right) => left - right)
  const minimum = scales[0]
  const maximum = scales.at(-1)
  const tolerance = Math.max(0, ...digitScales.map(({ pixelStep }) => pixelStep))
  if (
    minimum !== undefined &&
    maximum !== undefined &&
    maximum - minimum > tolerance + Number.EPSILON
  ) {
    throw new Error("Inconsistent osu combo digit heights do not represent one scale")
  }
  if (failures.length > 0) {
    return 1
  }

  const lowerMiddle = scales[4]
  const upperMiddle = scales[5]
  if (lowerMiddle === undefined || upperMiddle === undefined) {
    throw new Error("Could not calculate osu combo scale")
  }
  return (lowerMiddle + upperMiddle) / 2
}

async function readComboDigitScale(
  options: ReadOsuComboScaleOptions,
  digit: (typeof osuComboDigits)[number],
  dependencies: OsuComboDependencies,
): Promise<ComboDigitScale> {
  try {
    const asset = await resolveComboDigit(options, digit, dependencies)
    const { height } = await dependencies.readImageDimensions(asset.filePath)
    const density = asset.pixelDensity === "double" ? 2 : 1
    const referenceHeight = osuComboTemplateLogicalHeight * density
    return { scale: height / referenceHeight, pixelStep: 1 / referenceHeight }
  } catch (cause) {
    throw new Error(`Could not read osu combo digit ${digit}`, { cause })
  }
}

function resolveComboDigit(
  options: ReadOsuComboScaleOptions,
  digit: (typeof osuComboDigits)[number],
  dependencies: OsuComboDependencies,
): Promise<ImageAsset> {
  const resolution: ResolveOsuPngAssetOptions = {
    skinDirectory: options.skinDirectory,
    logicalPath: `${options.comboPrefix}-${digit}`,
    useDoubleResolutionAssets: options.useDoubleResolutionAssets,
  }
  return dependencies.resolveOsuPngAsset(resolution)
}

function isMissingComboDigit(error: unknown): boolean {
  return error instanceof Error && error.cause instanceof OsuPngAssetNotFoundError
}
