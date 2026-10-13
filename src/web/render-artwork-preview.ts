import type { ImageOperations } from "../application/ports/image-operations.ts"
import { columnDirections, type ImageAsset } from "../domain/image.ts"
import type { VisualSkinModel } from "../domain/visual-skin.ts"
import { invokeAsPromise, settleAll } from "../infrastructure/async/settle-all.ts"
import type { ArtworkPreviewLane } from "./worker-messages.ts"

export async function renderArtworkPreview(
  skin: VisualSkinModel,
  images: ImageOperations,
): Promise<readonly ArtworkPreviewLane[]> {
  const { tapNotes, receptors } = skin.assets
  if (!tapNotes || !receptors) throw new Error("Skin artwork is missing notes or receptors")
  const thumbnail = async (asset: ImageAsset) => {
    const rendered = await images.renderNote(asset)
    const dimensions = await images.dimensions(rendered)
    const scale = Math.min(1, 128 / dimensions.width, 128 / dimensions.height)
    return images.resizeProportionally(rendered, scale)
  }
  return settleAll(
    columnDirections.map((direction) =>
      invokeAsPromise(async () => {
        const [note, receptor] = await settleAll([
          invokeAsPromise(() => thumbnail(tapNotes[direction])),
          invokeAsPromise(() => thumbnail(receptors[direction].normal)),
        ])
        return { direction, note, receptor }
      }),
    ),
  )
}
