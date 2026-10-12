import type { Diagnostic } from "../../domain/diagnostics.ts"
import type { GameId } from "../../domain/game.ts"
import type { GeneratedFile } from "../../domain/generated-file.ts"
import type { SkinReference } from "../../domain/skin.ts"
import type { VisualSkinExporter } from "../ports/visual-skin-exporter.ts"
import type { VisualSkinReader } from "../ports/visual-skin-reader.ts"
import type { VisualConversionRegistry } from "./visual-conversion-registry.ts"

export async function convertVisualSkin(
  request: { reference: SkinReference; targetGame: GameId },
  dependencies: {
    readers: ReadonlyMap<GameId, VisualSkinReader>
    exporters: ReadonlyMap<GameId, VisualSkinExporter>
    conversions: VisualConversionRegistry
  },
): Promise<{ files: readonly GeneratedFile[]; diagnostics: Diagnostic[] }> {
  const reader = dependencies.readers.get(request.reference.game)
  if (!reader) throw new Error(`No skin reader is registered for ${request.reference.game}`)
  const exporter = dependencies.exporters.get(request.targetGame)
  if (!exporter) throw new Error(`No skin exporter is registered for ${request.targetGame}`)
  const conversion = dependencies.conversions.resolve(request.reference.game, request.targetGame)
  const source = await reader.readSkin(request.reference)
  const converted = await conversion.convert(source)
  const files = await exporter.exportSkin(converted)
  return { files, diagnostics: converted.diagnostics }
}
