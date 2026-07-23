import { access } from "node:fs/promises"
import { EtternaSkinCatalog } from "../adapters/etterna/catalog/etterna-skin-catalog.ts"
import { EtternaSkinReader } from "../adapters/etterna/reader/etterna-skin-reader.ts"
import { OsuSkinWriter } from "../adapters/osu/writer/osu-skin-writer.ts"
import { ConversionRegistry } from "../application/conversion/conversion-registry.ts"
import { convertSkin } from "../application/conversion/convert-skin.ts"
import type { SkinCatalog } from "../application/ports/skin-catalog.ts"
import type { SkinReader } from "../application/ports/skin-reader.ts"
import type { SkinWriter } from "../application/ports/skin-writer.ts"
import { gameDefaults } from "../config/game-defaults.ts"
import { osuTemplatesPath, outputPath } from "../config/paths.ts"
import { EtternaToOsuConversion } from "../conversions/etterna-to-osu/etterna-to-osu-conversion.ts"
import type { GameId } from "../domain/game.ts"
import { TransactionalOutputPublisher } from "../infrastructure/filesystem/transactional-output-publisher.ts"
import { askSelect } from "./prompts.ts"

export async function runCli(): Promise<void> {
  const catalogs = new Map<GameId, SkinCatalog>([["etterna", new EtternaSkinCatalog()]])
  const readers = new Map<GameId, SkinReader>([["etterna", new EtternaSkinReader()]])
  const writers = new Map<GameId, SkinWriter>([["osu", new OsuSkinWriter(osuTemplatesPath)]])
  const conversions = new ConversionRegistry([new EtternaToOsuConversion()])

  const sourceGame = await askSelect(
    "Select the source game:",
    [...catalogs.keys()].map((game) => ({ value: game, label: game })),
  )
  if (!sourceGame) {
    return
  }
  const source = sourceGame as GameId
  const gameLocation = gameDefaults[source].location
  await assertPathExists(gameLocation)

  const catalog = catalogs.get(source)
  if (!catalog) {
    throw new Error(`No skin catalog is registered for ${source}`)
  }
  const skins = await catalog.listSkins(gameLocation)
  const selectedPath = await askSelect(
    "Select the skin to convert:",
    skins.map((skin) => ({ value: skin.sourcePath, label: skin.name })),
  )
  if (!selectedPath) {
    return
  }
  const reference = skins.find((skin) => skin.sourcePath === selectedPath)
  if (!reference) {
    throw new Error("Selected skin is not available")
  }

  const result = await convertSkin(
    {
      reference,
      targetGame: "osu",
      outputDirectory: outputPath,
    },
    {
      readers,
      writers,
      conversions,
      publisher: new TransactionalOutputPublisher(),
    },
  )

  for (const diagnostic of result.diagnostics) {
    const direction = diagnostic.direction ? ` [${diagnostic.direction}]` : ""
    console.warn(
      `${diagnostic.severity.toUpperCase()} ${diagnostic.component}${direction}: ${diagnostic.message}`,
    )
  }
}

async function assertPathExists(location: string): Promise<void> {
  try {
    await access(location)
  } catch (error) {
    throw new Error(`Game folder does not exist: ${location}`, {
      cause: error,
    })
  }
}
