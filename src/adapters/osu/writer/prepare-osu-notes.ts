import type { ImageAsset, TapNoteSet } from "../../../domain/image.ts"
import { columnDirections } from "../../../domain/image.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"

type NoteRenderer = (definition: ImageAsset) => Promise<Uint8Array>

export interface PrepareOsuNotesOptions {
  notes: TapNoteSet
  render: NoteRenderer
}

export async function prepareOsuNotes(
  options: PrepareOsuNotesOptions,
): Promise<readonly { filename: string; buffer: Uint8Array }[]> {
  const render = options.render
  const prepared = await settleAll(
    columnDirections.map((direction) =>
      invokeAsPromise(async () => ({
        filename: `${direction}.png`,
        buffer: await render(options.notes[direction]),
      })),
    ),
  )

  return prepared
}
