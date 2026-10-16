import type { ImageAsset } from "../../../domain/image.ts"
import { resolveOsuPngAsset } from "../assets/resolve-osu-png-asset.ts"
import {
  type ResolveOsuJudgementAssetOptions,
  resolveOsuJudgementAssetUsing,
} from "./osu-judgement-policy.ts"

export type { ResolveOsuJudgementAssetOptions } from "./osu-judgement-policy.ts"
export function resolveOsuJudgementAsset(
  options: ResolveOsuJudgementAssetOptions,
): Promise<ImageAsset> {
  return resolveOsuJudgementAssetUsing(options, resolveOsuPngAsset)
}
