import type { ImageAsset } from "../../../domain/image.ts"
import { invokeAsPromise } from "../../../infrastructure/async/settle-all.ts"
import { readImageDimensions } from "../../../infrastructure/image/read-image-dimensions.ts"
import {
  OsuPngAssetNotFoundError,
  type ResolveOsuPngAssetOptions,
  resolveOsuPngAsset,
} from "../assets/resolve-osu-png-asset.ts"

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

export async function readOsuComboScale(options: ReadOsuComboScaleOptions): Promise<number> {
  const results = await Promise.allSettled(
    osuComboDigits.map((digit) => invokeAsPromise(() => readComboDigitScale(options, digit))),
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
): Promise<ComboDigitScale> {
  try {
    const asset = await resolveComboDigit(options, digit)
    const { height } = await readImageDimensions(asset.filePath)
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
): Promise<ImageAsset> {
  const resolution: ResolveOsuPngAssetOptions = {
    skinDirectory: options.skinDirectory,
    logicalPath: `${options.comboPrefix}-${digit}`,
    useDoubleResolutionAssets: options.useDoubleResolutionAssets,
  }
  return resolveOsuPngAsset(resolution)
}

function isMissingComboDigit(error: unknown): boolean {
  return error instanceof Error && error.cause instanceof OsuPngAssetNotFoundError
}
