import { mkdir } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset, ReceptorSet } from "../../../domain/image.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { writeFileContents } from "../../../infrastructure/filesystem/bun-file.ts"
import { isImageFullyTransparent } from "../../../infrastructure/image/is-image-fully-transparent.ts"
import {
  type RenderReceptorOptions,
  renderReceptorImage,
} from "../../../infrastructure/image/sharp-image-processor.ts"
import { prepareOsuReceptors } from "./prepare-osu-receptors.ts"

type ReceptorRenderer = (
  definition: ImageAsset,
  options: RenderReceptorOptions,
) => Promise<Uint8Array>
type ReceptorTransparencyInspector = (image: Uint8Array) => Promise<boolean>
type ReceptorWriter = (filePath: string, buffer: Uint8Array) => Promise<void>

export interface WriteOsuReceptorsOptions {
  receptors: ReceptorSet
  outputDirectory: string
  hitPosition: number
  columnWidth: number
  baseImagePath: string
  render?: ReceptorRenderer
  write?: ReceptorWriter
  inspectTransparency?: ReceptorTransparencyInspector
}

export async function writeOsuReceptors(options: WriteOsuReceptorsOptions): Promise<void> {
  const render = options.render ?? renderReceptorImage
  const write = options.write ?? writeFileContents
  const inspectTransparency = options.inspectTransparency ?? isImageFullyTransparent
  const prepared = await prepareOsuReceptors({ ...options, render, inspectTransparency })

  const receptorDirectory = path.join(options.outputDirectory, "mania", "receptors")
  await mkdir(receptorDirectory, { recursive: true })
  await settleAll(
    prepared.map(({ filename, buffer }) =>
      invokeAsPromise(() => write(path.join(receptorDirectory, filename), buffer)),
    ),
  )
}
