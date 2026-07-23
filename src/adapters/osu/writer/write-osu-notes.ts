import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset, TapNoteSet } from "../../../domain/image.ts"
import { columnDirections } from "../../../domain/image.ts"
import { renderNoteImage } from "../../../infrastructure/image/sharp-image-processor.ts"

type NoteRenderer = (definition: ImageAsset) => Promise<Buffer>

export interface WriteOsuNotesOptions {
  notes: TapNoteSet
  outputDirectory: string
  render?: NoteRenderer
}

export async function writeOsuNotes(options: WriteOsuNotesOptions): Promise<void> {
  const render = options.render ?? renderNoteImage
  const prepared = await Promise.all(
    columnDirections.map(async (direction) => ({
      filename: `${direction}.png`,
      buffer: await render(options.notes[direction]),
    })),
  )

  const noteDirectory = path.join(options.outputDirectory, "mania", "notes")
  await mkdir(noteDirectory, { recursive: true })
  await Promise.all(
    prepared.map(({ filename, buffer }) => writeFile(path.join(noteDirectory, filename), buffer)),
  )
}
