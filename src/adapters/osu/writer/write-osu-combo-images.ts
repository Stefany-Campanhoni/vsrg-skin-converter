import path from "node:path"
import { readBinaryFile, writeFileContents } from "../../../infrastructure/filesystem/bun-file.ts"
import { resizeImageProportionally } from "../../../infrastructure/image/resize-image.ts"
import { writeOsuComboImagesUsing } from "./osu-combo-output-policy.ts"

type ComboImageReader = (filePath: string) => Promise<Uint8Array>
type ComboImageResizer = (image: Uint8Array, scale: number) => Promise<Uint8Array>
type ComboImageWriter = (filePath: string, image: Uint8Array) => Promise<void>
export interface WriteOsuComboImagesOptions {
  outputDirectory: string
  scale: number
  read?: ComboImageReader
  resize?: ComboImageResizer
  write?: ComboImageWriter
}

export function writeOsuComboImages(options: WriteOsuComboImagesOptions): Promise<void> {
  return writeOsuComboImagesUsing({
    ...options,
    outputDirectory: "",
    read: (filename) =>
      (options.read ?? readBinaryFile)(path.join(options.outputDirectory, filename)),
    resize: options.resize ?? resizeImageProportionally,
    write: (filename, image) =>
      (options.write ?? writeFileContents)(path.join(options.outputDirectory, filename), image),
  })
}
