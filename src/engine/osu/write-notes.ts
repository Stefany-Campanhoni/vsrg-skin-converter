import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { renderNoteImage } from "../../transform/image.ts"
import type { NoteImage, NoteSet } from "../note.ts"
import { receptorDirections } from "../receptor.ts"

type NoteRenderer = (definition: NoteImage) => Promise<Buffer>

export interface WriteOsuNotesOptions {
  notes: NoteSet
  outputDirectory: string
  render?: NoteRenderer
}

export async function writeOsuNotes(options: WriteOsuNotesOptions): Promise<void> {
  const render = options.render ?? renderNoteImage
  const prepared = await Promise.all(
    receptorDirections.map(async (direction) => ({
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
