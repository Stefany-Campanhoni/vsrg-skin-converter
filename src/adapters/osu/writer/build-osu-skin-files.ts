import type { GeneratedFiles } from "../../../application/ports/generated-files.ts"
import type { ImageOperations } from "../../../application/ports/image-operations.ts"
import type { SourceFiles } from "../../../application/ports/source-files.ts"
import { type JudgementSet, judgementGrades } from "../../../domain/judgement.ts"
import type { VisualSkinModel } from "../../../domain/visual-skin.ts"
import { copySourceTree } from "../../../infrastructure/archive/copy-source-tree.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { replaceWildcards } from "../templates/osu-template-content.ts"
import { writeOsuComboImagesUsing } from "./osu-combo-output-policy.ts"
import { osuInstallationGuide } from "./osu-installation-guide.ts"
import { internalOsuTemplateArtifacts, longNoteTemplateAssets } from "./osu-template-assets.ts"
import { prepareOsuJudgements } from "./prepare-osu-judgements.ts"
import { prepareOsuNotes } from "./prepare-osu-notes.ts"
import { prepareOsuReceptors } from "./prepare-osu-receptors.ts"
export async function buildOsuSkinFiles(
  skin: VisualSkinModel,
  {
    templates,
    images,
    output,
  }: { templates: SourceFiles; images: ImageOperations; output: GeneratedFiles },
): Promise<void> {
  if (skin.game !== "osu") throw new Error(`osu writer cannot write a ${skin.game} skin`)
  const { receptors, tapNotes } = skin.assets
  if (!receptors) throw new Error("osu skin model does not contain receptors")
  if (!tapNotes) throw new Error("osu skin model does not contain tap notes")
  const root = skin.metadata.name
  const write = (path: string, data: Uint8Array) => output.write(`${root}/${path}`, data)
  const read = (path: string) => output.readBytes(`${root}/${path}`)
  await copySourceTree(templates, "", output, root)
  const ini = replaceWildcards(new TextDecoder().decode(await read("skin.ini")), {
    skin_name: skin.metadata.name,
    hit_position: skin.playfield.hitPosition,
    combo_position: skin.playfield.comboPosition,
    score_position: skin.playfield.judgementPosition,
    column_width: skin.playfield.columnWidth,
  })
  await write("skin.ini", new TextEncoder().encode(ini))
  const judgements: JudgementSet = skin.assets.judgements ?? {
    sourceDensity: 1,
    images: Object.fromEntries(
      judgementGrades.map((grade) => [
        grade,
        { filePath: templates.assetId(`mania/judgements/${grade}.png`), rotation: 0 },
      ]),
    ),
  }
  await settleAll([
    invokeAsPromise(async () => {
      const prepared = await prepareOsuReceptors({
        receptors,
        hitPosition: skin.playfield.hitPosition,
        columnWidth: skin.playfield.columnWidth,
        baseImagePath: templates.assetId("receptor-base.png"),
        render: images.renderReceptor,
        inspectTransparency: images.isTransparent,
      })
      await settleAll(
        prepared.map((asset) =>
          invokeAsPromise(() => write(`mania/receptors/${asset.filename}`, asset.buffer)),
        ),
      )
    }),
    invokeAsPromise(async () => {
      const prepared = await prepareOsuNotes({ notes: tapNotes, render: images.renderNote })
      await settleAll(
        prepared.map((asset) =>
          invokeAsPromise(() => write(`mania/notes/${asset.filename}`, asset.buffer)),
        ),
      )
    }),
    invokeAsPromise(async () => {
      const prepared = await prepareOsuJudgements({
        judgements,
        scale: skin.playfield.judgementScale,
        render: images.renderJudgementVariants,
      })
      await settleAll(
        prepared.flatMap(({ grade, variants }) => [
          invokeAsPromise(() =>
            write(`mania/judgements/${grade}.png`, variants.standardResolution),
          ),
          invokeAsPromise(() =>
            write(`mania/judgements/${grade}@2x.png`, variants.doubleResolution),
          ),
        ]),
      )
    }),
    invokeAsPromise(() =>
      writeOsuComboImagesUsing({
        outputDirectory: "",
        scale: skin.playfield.comboScale,
        read,
        resize: images.resizeProportionally,
        write,
      }),
    ),
    invokeAsPromise(() =>
      settleAll(
        longNoteTemplateAssets.map((asset) =>
          invokeAsPromise(async () =>
            write(`mania/lns/${asset.outputFilename}`, await read(asset.sourceFilename)),
          ),
        ),
      ),
    ),
  ])
  await settleAll(
    internalOsuTemplateArtifacts.map((name) =>
      invokeAsPromise(() => output.remove(`${root}/${name}`)),
    ),
  )
  await output.write("INSTALLATION.md", new TextEncoder().encode(osuInstallationGuide(skin)))
}
