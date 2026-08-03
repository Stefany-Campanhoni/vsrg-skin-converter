import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ImageAsset, TapNoteSet } from "../../../domain/image.ts"
import { columnDirections } from "../../../domain/image.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { renderNoteImage } from "../../../infrastructure/image/sharp-image-processor.ts"

type NoteRenderer = (definition: ImageAsset) => Promise<Buffer>
type NoteWriter = (filePath: string, buffer: Buffer) => Promise<void>

export interface WriteOsuNotesOptions {
  notes: TapNoteSet
  outputDirectory: string
  render?: NoteRenderer
  write?: NoteWriter
}

export async function writeOsuNotes(options: WriteOsuNotesOptions): Promise<void> {
  const render = options.render ?? renderNoteImage
  const write = options.write ?? writeFile
  const prepared = await settleAll(
    columnDirections.map((direction) =>
      invokeAsPromise(async () => ({
        filename: `${direction}.png`,
        buffer: await render(options.notes[direction]),
      })),
    ),
  )

  const noteDirectory = path.join(options.outputDirectory, "mania", "notes")
  await mkdir(noteDirectory, { recursive: true })
  await settleAll(
    prepared.map(({ filename, buffer }) =>
      invokeAsPromise(() => write(path.join(noteDirectory, filename), buffer)),
    ),
  )
}
