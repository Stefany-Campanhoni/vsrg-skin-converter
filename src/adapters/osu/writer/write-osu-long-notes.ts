import { copyFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { settleAll } from "../../../infrastructure/async/settle-all.ts"

const longNoteTemplateAssets = [
  { sourceFilename: "LNB.png", outputFilename: "body.png" },
  { sourceFilename: "LNT.png", outputFilename: "tail.png" },
] as const

export interface WriteOsuLongNotesOptions {
  outputDirectory: string
}

export async function writeOsuLongNotes(options: WriteOsuLongNotesOptions): Promise<void> {
  const longNoteDirectory = path.join(options.outputDirectory, "mania", "lns")
  await mkdir(longNoteDirectory, { recursive: true })
  await settleAll(
    longNoteTemplateAssets.map(({ sourceFilename, outputFilename }) =>
      copyFile(
        path.join(options.outputDirectory, sourceFilename),
        path.join(longNoteDirectory, outputFilename),
      ),
    ),
  )
}
