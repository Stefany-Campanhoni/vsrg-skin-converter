import type { Diagnostic } from "../../domain/diagnostics.ts"
import type { GameId } from "../../domain/game.ts"
import type { SkinReference } from "../../domain/skin.ts"
import type { OutputPublisher } from "../ports/output-publisher.ts"
import type { SkinReader } from "../ports/skin-reader.ts"
import type { SkinWriter } from "../ports/skin-writer.ts"
import type { ConversionRegistry } from "./conversion-registry.ts"

export interface ConvertSkinRequest {
  reference: SkinReference
  targetGame: GameId
  outputDirectory: string
}

export interface ConvertSkinDependencies {
  readers: ReadonlyMap<GameId, SkinReader>
  writers: ReadonlyMap<GameId, SkinWriter>
  conversions: ConversionRegistry
  publisher: OutputPublisher
}

export interface ConversionResult {
  diagnostics: Diagnostic[]
}

export async function convertSkin(
  request: ConvertSkinRequest,
  dependencies: ConvertSkinDependencies,
): Promise<ConversionResult> {
  const reader = resolveReader(dependencies.readers, request.reference.game)
  const writer = resolveWriter(dependencies.writers, request.targetGame)
  const conversion = dependencies.conversions.resolve(request.reference.game, request.targetGame)

  const source = await reader.readSkin(request.reference)
  const converted = await conversion.convert(source)
  await dependencies.publisher.publish(request.outputDirectory, async (workspace) =>
    writer.writeSkin(converted, workspace),
  )

  return { diagnostics: converted.diagnostics }
}

function resolveReader(readers: ReadonlyMap<GameId, SkinReader>, game: GameId): SkinReader {
  const reader = readers.get(game)
  if (!reader) {
    throw new Error(`No skin reader is registered for ${game}`)
  }
  return reader
}

function resolveWriter(writers: ReadonlyMap<GameId, SkinWriter>, game: GameId): SkinWriter {
  const writer = writers.get(game)
  if (!writer) {
    throw new Error(`No skin writer is registered for ${game}`)
  }
  return writer
}
