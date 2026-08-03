import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { resizeImageProportionally } from "../../../infrastructure/image/resize-image.ts"

type ComboImageReader = (filePath: string) => Promise<Buffer>
type ComboImageResizer = (image: Buffer, scale: number) => Promise<Buffer>
type ComboImageWriter = (filePath: string, image: Buffer) => Promise<void>

const osuComboDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const
const osuComboDensitySuffixes = ["", "@2x"] as const
const osuComboImageFilenames = osuComboDigits.flatMap((digit) =>
  osuComboDensitySuffixes.map((suffix) => `score-${digit}${suffix}.png`),
)

export interface WriteOsuComboImagesOptions {
  outputDirectory: string
  scale: number
  read?: ComboImageReader
  resize?: ComboImageResizer
  write?: ComboImageWriter
}

export async function writeOsuComboImages(options: WriteOsuComboImagesOptions): Promise<void> {
  const read = options.read ?? readFile
  const resize = options.resize ?? resizeImageProportionally
  const write = options.write ?? writeFile

  const prepared = await settleAll(
    osuComboImageFilenames.map((filename) =>
      invokeAsPromise(async () => {
        const filePath = path.join(options.outputDirectory, filename)
        try {
          const image = await read(filePath)
          return { filePath, image: await resize(image, options.scale) }
        } catch (cause) {
          throw new Error(`Could not prepare osu combo image ${filename}`, { cause })
        }
      }),
    ),
  )

  await settleAll(
    prepared.map(({ filePath, image }) =>
      invokeAsPromise(async () => {
        try {
          await write(filePath, image)
        } catch (cause) {
          throw new Error(`Could not write osu combo image ${path.basename(filePath)}`, { cause })
        }
      }),
    ),
  )
}
