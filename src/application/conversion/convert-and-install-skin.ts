import type { GameId } from "../../domain/game.ts"
import type { SkinReference } from "../../domain/skin.ts"
import type { SkinInstaller } from "../ports/skin-installer.ts"
import type { SkinReader } from "../ports/skin-reader.ts"
import type { ConversionRegistry } from "./conversion-registry.ts"
import type { ConversionResult } from "./convert-skin.ts"

export interface ConvertAndInstallSkinRequest {
  readonly reference: SkinReference
  readonly targetGame: GameId
}

export interface ConvertAndInstallSkinDependencies {
  readonly readers: ReadonlyMap<GameId, SkinReader>
  readonly installers: ReadonlyMap<GameId, SkinInstaller>
  readonly conversions: ConversionRegistry
}

export async function convertAndInstallSkin(
  request: ConvertAndInstallSkinRequest,
  dependencies: ConvertAndInstallSkinDependencies,
): Promise<ConversionResult> {
  const reader = resolveReader(dependencies.readers, request.reference.game)
  const installer = resolveInstaller(dependencies.installers, request.targetGame)
  const conversion = dependencies.conversions.resolve(request.reference.game, request.targetGame)

  const source = await reader.readSkin(request.reference)
  const converted = await conversion.convert(source)
  await installer.installSkin(converted)

  return { diagnostics: converted.diagnostics }
}

function resolveReader(readers: ReadonlyMap<GameId, SkinReader>, game: GameId): SkinReader {
  const reader = readers.get(game)
  if (!reader) {
    throw new Error(`No skin reader is registered for ${game}`)
  }
  return reader
}

function resolveInstaller(
  installers: ReadonlyMap<GameId, SkinInstaller>,
  game: GameId,
): SkinInstaller {
  const installer = installers.get(game)
  if (!installer) {
    throw new Error(`No skin installer is registered for ${game}`)
  }
  return installer
}
