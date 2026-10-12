import luaparse from "luaparse"
import type { ImageOperations } from "../../../application/ports/image-operations.ts"
import {
  SourceFileNotFoundError,
  type SourceFiles,
} from "../../../application/ports/source-files.ts"
import type { Diagnostic } from "../../../domain/diagnostics.ts"
import type { VisualPlayfieldConfiguration, VisualSkinModel } from "../../../domain/visual-skin.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import { readSourceText } from "../../../infrastructure/filesystem/read-source-text.ts"
import {
  listSourceFiles,
  resolveSourcePath,
} from "../../../infrastructure/filesystem/resolve-source-path.ts"
import {
  sourceExtname,
  sourceRelativePath,
} from "../../../infrastructure/filesystem/source-relative-path.ts"
import { resolveEtternaJudgementUsing } from "../assets/etterna-judgement-selection-policy.ts"
import { analyzeEtternaJudgementSheetUsing } from "../judgements/etterna-judgement-sheet-policy.ts"
import { createIndexedSkinFileResolver } from "../noteskin/indexed-skin-file-resolver.ts"
import { analyzeEtternaNotesUsing } from "../noteskin/notes/shared-analyze-notes.ts"
import { analyzeEtternaReceptorsUsing } from "../noteskin/receptors/shared-analyze-receptors.ts"
import { createNoteSkinContext } from "../noteskin/shared-note-skin-context.ts"
import { extractOptionalEtternaCmod } from "../profile/extract-etterna-cmod.ts"
import { extractEtternaPlayfieldConfiguration } from "../profile/extract-etterna-profile.ts"
import { extractEtternaProfileGuid } from "../profile/extract-etterna-profile-guid.ts"
import { assertSafeEtternaDirectorySegment } from "../settings/etterna-directory-segment.ts"

export interface EtternaVisualSourceOptions {
  skinPath: string
  name: string
  profileId?: string
  theme: string
  useDefaultSettings: boolean
}
export async function readEtternaVisualSkinFromSource(
  source: SourceFiles,
  images: ImageOperations,
  options: EtternaVisualSourceOptions,
): Promise<{ skin: VisualSkinModel; scrollSpeed?: number }> {
  assertSafeEtternaDirectorySegment(options.theme, "theme")
  if (options.profileId) assertSafeEtternaDirectorySegment(options.profileId, "profile ID")
  const diagnostics: Diagnostic[] = []
  const readOptional = async (path: string): Promise<string | undefined> => {
    try {
      return await readSourceText(source, await resolveSourcePath(source, path))
    } catch (error) {
      if (error instanceof SourceFileNotFoundError) return undefined
      throw error
    }
  }
  const skinPath = await resolveSourcePath(source, options.skinPath, "directory")
  const files = await listSourceFiles(source, skinPath)
  const noteSkinFile = await resolveSourcePath(source, `${skinPath}/NoteSkin.lua`)
  const readIdentity = async (id: string) => new TextDecoder().decode(await source.readAsset(id))
  const resolver = createIndexedSkinFileResolver(skinPath, files, readIdentity, (path) =>
    source.assetId(path),
  )
  const context = createNoteSkinContext(
    await readSourceText(source, noteSkinFile),
    noteSkinFile,
    resolver,
  )
  let playfield: VisualPlayfieldConfiguration = {
    hitPosition: 0,
    judgementPosition: 0,
    comboPosition: 0,
    columnWidth: 100,
    comboScale: 1,
    judgementScale: 1,
  }
  const settings = options.profileId
    ? await readOptional(
        `Save/LocalProfiles/${options.profileId}/${options.theme}_settings/playerConfig.lua`,
      )
    : undefined
  if (settings === undefined)
    diagnostics.push({
      code: "web.etterna.default-settings",
      component: "settings",
      severity: "warning",
      message: "Missing profile settings; using default visual settings.",
    })
  else playfield = extractEtternaPlayfieldConfiguration(luaparse.parse(settings))
  const xmlPath = options.profileId
    ? `Save/LocalProfiles/${options.profileId}/Etterna.xml`
    : undefined
  const xml = xmlPath ? await readOptional(xmlPath) : undefined
  const guid = xml === undefined ? "" : extractEtternaProfileGuid(xml, xmlPath ?? "Etterna.xml")
  const scrollSpeed =
    xml === undefined ? undefined : extractOptionalEtternaCmod(xml, xmlPath ?? "Etterna.xml")
  if (scrollSpeed === undefined)
    diagnostics.push({
      code: "web.etterna.manual-speed",
      component: "settings",
      severity: "warning",
      message:
        "No CMod was found in the selected profile. Configure ManiaSpeed manually; no speed was generated.",
    })
  const configPath = `Save/${options.theme}_settings/assetsConfig.lua`
  const config = await readOptional(configPath)
  const selection =
    config === undefined
      ? undefined
      : await resolveEtternaJudgementUsing(
          config,
          guid,
          configPath,
          (path) => {
            const relative = sourceRelativePath(path)
            if (![".png", ".jpg", ".jpeg"].includes(sourceExtname(relative).toLowerCase()))
              throw new Error("Unsupported Etterna judgement image")
            return relative
          },
          async (path) => {
            try {
              return source.assetId(await resolveSourcePath(source, path))
            } catch (error) {
              if (error instanceof SourceFileNotFoundError) return undefined
              throw error
            }
          },
        )
  if (!selection)
    diagnostics.push({
      code: "web.etterna.default-judgements",
      component: "judgements",
      severity: "warning",
      message: "Missing asset configuration; using bundled target judgements.",
    })
  const [receptors, notes, judgements] = await settleAll([
    invokeAsPromise(() => analyzeEtternaReceptorsUsing(context, readIdentity)),
    invokeAsPromise(() => analyzeEtternaNotesUsing(context, readIdentity)),
    invokeAsPromise(async () =>
      selection
        ? analyzeEtternaJudgementSheetUsing(selection.filePath, async (id) =>
            images.dimensions(await source.readAsset(id)),
          )
        : undefined,
    ),
  ])
  return {
    skin: {
      game: "etterna",
      metadata: { name: options.name },
      playfield,
      assets: {
        receptors: receptors.receptors,
        tapNotes: notes.notes,
        ...(judgements ? { judgements } : {}),
      },
      diagnostics: [
        ...receptors.diagnostics,
        ...notes.diagnostics,
        ...(selection?.diagnostics ?? []),
        ...diagnostics,
      ],
    },
    ...(scrollSpeed === undefined ? {} : { scrollSpeed }),
  }
}
