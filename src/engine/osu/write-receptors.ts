import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { type RenderReceptorOptions, renderReceptorImage } from "../../transform/image.ts"
import {
  type ReceptorImage,
  type ReceptorSet,
  receptorDirections,
  receptorStates,
} from "../receptor.ts"

type ReceptorRenderer = (
  definition: ReceptorImage,
  options: RenderReceptorOptions,
) => Promise<Buffer>

export interface WriteOsuReceptorsOptions {
  receptors: ReceptorSet
  outputDirectory: string
  hitPosition: number
  baseImagePath: string
  render?: ReceptorRenderer
}

export async function writeOsuReceptors(options: WriteOsuReceptorsOptions): Promise<void> {
  const render = options.render ?? renderReceptorImage
  const renderOptions: RenderReceptorOptions = {
    hitPosition: options.hitPosition,
    baseImagePath: options.baseImagePath,
  }
  const prepared = await Promise.all(
    receptorDirections.flatMap((direction) =>
      receptorStates.map(async (state) => ({
        filename: `${direction}${state === "pressed" ? "_tap" : ""}.png`,
        buffer: await render(options.receptors[direction][state], renderOptions),
      })),
    ),
  )

  const receptorDirectory = path.join(options.outputDirectory, "mania", "receptors")
  await mkdir(receptorDirectory, { recursive: true })
  await Promise.all(
    prepared.map(({ filename, buffer }) =>
      writeFile(path.join(receptorDirectory, filename), buffer),
    ),
  )
}
