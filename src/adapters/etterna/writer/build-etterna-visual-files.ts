import type { GeneratedFiles } from "../../../application/ports/generated-files.ts"
import type { ImageOperations } from "../../../application/ports/image-operations.ts"
import type { SourceFiles } from "../../../application/ports/source-files.ts"
import type { VisualSkinModel } from "../../../domain/visual-skin.ts"
import { copySourceTree } from "../../../infrastructure/archive/copy-source-tree.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { analyzeEtternaJudgementSheetUsing } from "../judgements/etterna-judgement-sheet-policy.ts"
import { assertSafeEtternaDirectorySegment } from "../settings/etterna-directory-segment.ts"
import { renderEtternaVisualSettings } from "../templates/render-etterna-visual-settings.ts"
import { etternaInstallationGuide } from "./etterna-installation-guide.ts"
import { prepareEtternaNotesUsing } from "./prepare-etterna-notes.ts"
import { prepareEtternaReceptorsUsing } from "./prepare-etterna-receptors.ts"
import { readEtternaTapNoteDimensions } from "./read-etterna-note-dimensions.ts"
import { renderEtternaJudgementSheet } from "./render-etterna-judgement-sheet.ts"
export async function buildEtternaVisualFiles(
  skin: VisualSkinModel,
  {
    templates,
    images,
    output,
  }: { templates: SourceFiles; images: ImageOperations; output: GeneratedFiles },
): Promise<void> {
  if (skin.game !== "etterna") throw new Error(`Etterna writer cannot write a ${skin.game} skin`)
  assertSafeEtternaDirectorySegment(skin.metadata.name, "NoteSkin name")
  const { receptors, tapNotes, judgements } = skin.assets
  if (!receptors) throw new Error("Etterna skin model does not contain receptors")
  if (!tapNotes) throw new Error("Etterna skin model does not contain tap notes")
  if (!judgements) throw new Error("Etterna skin model does not contain judgements")
  const root = `NoteSkins/dance/${skin.metadata.name}`
  await copySourceTree(templates, "noteskin", output, root)
  const dimensions = await readEtternaTapNoteDimensions(tapNotes, async (id) =>
    images.dimensions(await sourceAsset(id)),
  )
  // The image port's loader owns source identities; extracting a frame without a frame preserves bytes.
  async function sourceAsset(id: string): Promise<Uint8Array> {
    return images.extractFrame({ filePath: id })
  }
  const [preparedReceptors, preparedNotes] = await settleAll([
    invokeAsPromise(() =>
      prepareEtternaReceptorsUsing({
        receptors,
        noteDimensions: dimensions,
        read: sourceAsset,
        normalize: images.normalizeReceptor,
        inspectTransparency: images.isTransparent,
        readDimensions: images.dimensions,
      }),
    ),
    invokeAsPromise(() =>
      prepareEtternaNotesUsing({
        notes: tapNotes,
        read: sourceAsset,
        resize: images.resizeToWidth,
        readDimensions: images.dimensions,
      }),
    ),
  ])
  await settleAll([
    ...preparedReceptors.map((asset) =>
      invokeAsPromise(() => output.write(`${root}/Receptors/${asset.filename}`, asset.buffer)),
    ),
    ...preparedNotes.map((asset) =>
      invokeAsPromise(() => output.write(`${root}/Notes/${asset.filename}`, asset.buffer)),
    ),
  ])
  const defaultSheet = templates.assetId("judgement/osu!mania-default 1x6.png")
  const sheet = await renderEtternaJudgementSheet(skin, defaultSheet, {
    analyzeDefaultJudgements: (id) =>
      analyzeEtternaJudgementSheetUsing(id, async (asset) =>
        images.dimensions(await templates.readAsset(asset)),
      ),
    render: images.renderJudgementVariants,
    compose: images.composeVerticalSheet,
  })
  const filename = `${skin.metadata.name} 1x6${judgements.sourceDensity === 2 ? " (Doubleres)" : ""}.png`
  await output.write(`Assets/Judgments/${filename}`, sheet)
  const config = renderEtternaVisualSettings(
    skin,
    new TextDecoder().decode(await templates.readBytes("profile/playerConfig.lua")),
  )
  await output.write("profile-settings/playerConfig.lua", new TextEncoder().encode(config))
  await output.write(
    "INSTALLATION.md",
    new TextEncoder().encode(etternaInstallationGuide(skin, filename)),
  )
}
