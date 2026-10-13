import { readEtternaVisualSkinFromSource } from "../adapters/etterna/reader/read-etterna-visual-skin-from-source.ts"
import { buildEtternaVisualFiles } from "../adapters/etterna/writer/build-etterna-visual-files.ts"
import { readOsuVisualSkinFromSource } from "../adapters/osu/reader/read-osu-visual-skin-from-source.ts"
import { buildOsuSkinFiles } from "../adapters/osu/writer/build-osu-skin-files.ts"
import { osuInstallationGuide } from "../adapters/osu/writer/osu-installation-guide.ts"
import { convertVisualSkin } from "../application/conversion/convert-visual-skin.ts"
import { VisualConversionRegistry } from "../application/conversion/visual-conversion-registry.ts"
import type { SourceFiles } from "../application/ports/source-files.ts"
import { EtternaToOsuConversion } from "../conversions/etterna-to-osu/etterna-to-osu-conversion.ts"
import { EtternaToOsuVisualConversion } from "../conversions/etterna-to-osu/etterna-to-osu-visual-conversion.ts"
import { OsuToEtternaVisualConversion } from "../conversions/osu-to-etterna/osu-to-etterna-visual-conversion.ts"
import type { GameId } from "../domain/game.ts"
import type { VisualSkinModel } from "../domain/visual-skin.ts"
import { createSkinArchive } from "../infrastructure/archive/create-skin-archive.ts"
import { createGeneratedFileSet } from "../infrastructure/archive/generated-file-set.ts"
import { createRegisteredAssetLoader } from "../infrastructure/filesystem/registered-asset-loader.ts"
import type { RasterBackend } from "../infrastructure/image/raster-backend.ts"
import { createImageOperations } from "../infrastructure/image/shared-image-operations.ts"
import { createBrowserSourceFiles } from "./browser-source.ts"
import { renderArtworkPreview } from "./render-artwork-preview.ts"
import type {
  ConversionPreview,
  ConversionProgress,
  WebConversionRequest,
  WebConversionResult,
} from "./worker-messages.ts"

export function createWebConversionRuntime(dependencies: {
  backend: RasterBackend
  loadTemplates: (game: GameId) => Promise<SourceFiles>
}) {
  const loader = createRegisteredAssetLoader(),
    images = createImageOperations(loader, dependencies.backend)
  let disposed = false,
    active: Promise<unknown> | undefined
  async function execute(
    request: WebConversionRequest,
    onProgress: (progress: ConversionProgress) => void,
    inspect: boolean,
  ): Promise<WebConversionResult | ConversionPreview> {
    const output = createGeneratedFileSet(256 * 1024 * 1024)
    const source = createBrowserSourceFiles(request.source)
    loader.register(source)
    const sourceGame = request.direction === "etterna-to-osu" ? "etterna" : "osu",
      targetGame = sourceGame === "etterna" ? "osu" : "etterna"
    const name =
      request.direction === "etterna-to-osu"
        ? (request.skinPath.split("/").at(-1) ?? "Converted")
        : request.skinName
    let cmod: number | undefined,
      maniaSpeed: number | undefined,
      converted: VisualSkinModel | undefined
    const step = (phase: ConversionProgress["phase"], completed = 0) =>
      onProgress({ phase, completed, total: 1 })
    const read = async () => {
      step("reading")
      if (request.direction === "etterna-to-osu") {
        const result = await readEtternaVisualSkinFromSource(source, images, { ...request, name })
        cmod = result.scrollSpeed
        step("reading", 1)
        return result.skin
      }
      const skin = await readOsuVisualSkinFromSource(source, images, {
        name,
        useDoubleResolutionAssets: request.useDoubleResolutionAssets,
      })
      step("reading", 1)
      return skin
    }
    const conversion =
      sourceGame === "etterna"
        ? new EtternaToOsuVisualConversion()
        : new OsuToEtternaVisualConversion()
    const convert = async (skin: VisualSkinModel) => {
      step("converting")
      if (cmod === undefined) converted = await conversion.convert(skin)
      else {
        const full = await new EtternaToOsuConversion().convert({
          ...skin,
          playfield: { ...skin.playfield, scrollSpeed: cmod },
        })
        const { scrollSpeed, ...visual } = full.playfield
        maniaSpeed = scrollSpeed
        converted = { ...full, playfield: visual }
      }
      step("converting", 1)
      return converted
    }
    try {
      if (inspect) {
        const skin = await convert(await read())
        return {
          artwork: await renderArtworkPreview(skin, images),
          playfield: skin.playfield,
          diagnostics: skin.diagnostics,
          ...(maniaSpeed === undefined ? {} : { convertedManiaSpeed: maniaSpeed }),
        }
      }
      const templates = await dependencies.loadTemplates(targetGame)
      loader.register(templates)
      const result = await convertVisualSkin(
        { reference: { game: sourceGame, name, sourcePath: name, gameRoot: "" }, targetGame },
        {
          readers: new Map([[sourceGame, { game: sourceGame, readSkin: read }]]),
          exporters: new Map([
            [
              targetGame,
              {
                game: targetGame,
                exportSkin: async (skin) => {
                  step("rendering")
                  await (targetGame === "osu" ? buildOsuSkinFiles : buildEtternaVisualFiles)(skin, {
                    templates,
                    images,
                    output,
                  })
                  if (targetGame === "osu")
                    await output.write(
                      "INSTALLATION.md",
                      new TextEncoder().encode(osuInstallationGuide(skin, maniaSpeed)),
                    )
                  step("rendering", 1)
                  return output.snapshot()
                },
              },
            ],
          ]),
          conversions: new VisualConversionRegistry([
            { source: sourceGame, target: targetGame, convert },
          ]),
        },
      )
      step("archiving")
      const archive = await createSkinArchive(result.files)
      step("archiving", 1)
      return {
        archive,
        filename: `${name}-${targetGame}.zip`,
        diagnostics: result.diagnostics,
        ...(maniaSpeed === undefined ? {} : { convertedManiaSpeed: maniaSpeed }),
      }
    } finally {
      loader.clear()
      output.clear()
    }
  }
  async function start(
    request: WebConversionRequest,
    onProgress: (progress: ConversionProgress) => void,
    inspect: boolean,
  ) {
    if (disposed) throw new Error("Conversion runtime was disposed")
    if (active) throw new Error("A conversion is already running")
    const job = execute(request, onProgress, inspect)
    active = job
    try {
      return await job
    } finally {
      active = undefined
    }
  }
  return {
    async run(
      request: WebConversionRequest,
      onProgress: (progress: ConversionProgress) => void,
    ): Promise<WebConversionResult> {
      const result = await start(request, onProgress, false)
      if (!("archive" in result)) throw new Error("Expected conversion archive")
      return result
    },
    async inspect(request: WebConversionRequest): Promise<ConversionPreview> {
      const result = await start(request, () => {}, true)
      if (!("playfield" in result)) throw new Error("Expected conversion preview")
      return result
    },
    async dispose() {
      disposed = true
      try {
        await active
      } catch {
      } finally {
        loader.clear()
        await dependencies.backend.dispose()
      }
    },
  }
}
