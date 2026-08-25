import { EtternaSkinCatalog } from "../../adapters/etterna/catalog/etterna-skin-catalog.ts"
import {
  type EtternaProfile,
  listEtternaProfiles,
} from "../../adapters/etterna/profile/etterna-profile-catalog.ts"
import { EtternaSkinReader } from "../../adapters/etterna/reader/etterna-skin-reader.ts"
import { readEtternaTheme } from "../../adapters/etterna/theme/read-etterna-theme.ts"
import {
  prepareOsuUserConfigurationUpdate,
  writeOsuUserConfigurationUpdate,
} from "../../adapters/osu/config/prepare-osu-user-configuration-update.ts"
import {
  OsuSkinInstaller,
  type OsuSkinInstallerConfiguration,
} from "../../adapters/osu/install/osu-skin-installer.ts"
import { OsuSkinWriter } from "../../adapters/osu/writer/osu-skin-writer.ts"
import { ConversionRegistry } from "../../application/conversion/conversion-registry.ts"
import {
  type ConvertAndInstallSkinRequest,
  convertAndInstallSkin,
} from "../../application/conversion/convert-and-install-skin.ts"
import type { SkinInstaller } from "../../application/ports/skin-installer.ts"
import { gameDefaults } from "../../config/game-defaults.ts"
import { resolveDefaultOsuInstallationDirectory } from "../../config/osu-installation.ts"
import { osuTemplatesPath, resolveOsuSkinOutputPath } from "../../config/paths.ts"
import { EtternaToOsuConversion } from "../../conversions/etterna-to-osu/etterna-to-osu-conversion.ts"
import type { SkinReference } from "../../domain/skin.ts"
import { TransactionalOutputSetPublisher } from "../../infrastructure/filesystem/transactional-output-set-publisher.ts"
import { pickDirectory } from "../folder-picker.ts"
import {
  directoryExists,
  type InstallationDirectoryDependencies,
  resolveInstallationDirectory,
} from "../installation-directory.ts"
import { askSelect, type SelectOption, waitForAnyKey } from "../prompts.ts"

type SelectProfile = (message: string, options: SelectOption[]) => Promise<string | undefined>

export type OsuInstallerRouteConfiguration = OsuSkinInstallerConfiguration

export interface EtternaToOsuRouteDependencies {
  readonly etternaDefaultLocation: string
  readonly localAppData: string | undefined
  readonly windowsUsername: string | undefined
  resolveInstallationDirectory(
    defaultDirectory: string | undefined,
    prompt: string,
  ): Promise<string | undefined>
  listEtternaProfiles(gameRoot: string): Promise<EtternaProfile[]>
  selectEtternaProfile(configurations: EtternaProfile[]): Promise<string | undefined>
  readEtternaTheme(gameRoot: string): Promise<string>
  listSkins(gameRoot: string): Promise<SkinReference[]>
  selectSkin(message: string, options: SelectOption[]): Promise<string | undefined>
  resolveDefaultOsuInstallationDirectory(localAppData: string | undefined): string | undefined
  resolveOsuSkinOutputPath(skinName: string, osuInstallationDirectory: string): string
  createInstaller(configuration: OsuInstallerRouteConfiguration): SkinInstaller
  convertAndInstallSkin(
    request: ConvertAndInstallSkinRequest,
  ): ReturnType<typeof convertAndInstallSkin>
  waitForAnyKey(message: string): Promise<void>
  warn(message: string): void
}

const installationDirectoryDependencies: InstallationDirectoryDependencies = {
  directoryExists,
  waitForAnyKey,
  pickDirectory,
}

const defaultDependencies: Omit<EtternaToOsuRouteDependencies, "convertAndInstallSkin"> = {
  etternaDefaultLocation: gameDefaults.etterna.location,
  localAppData: process.env.LOCALAPPDATA,
  windowsUsername: process.env.USERNAME,
  resolveInstallationDirectory: (defaultDirectory, prompt) =>
    resolveInstallationDirectory(defaultDirectory, prompt, installationDirectoryDependencies),
  listEtternaProfiles,
  selectEtternaProfile: (profiles) => selectEtternaProfile(profiles, askSelect),
  readEtternaTheme,
  listSkins: (gameRoot) => new EtternaSkinCatalog().listSkins(gameRoot),
  selectSkin: askSelect,
  resolveDefaultOsuInstallationDirectory,
  resolveOsuSkinOutputPath,
  createInstaller: createDefaultOsuInstaller,
  waitForAnyKey,
  warn: console.warn,
}

export function createDefaultOsuInstaller(
  configuration: OsuInstallerRouteConfiguration,
): OsuSkinInstaller {
  return new OsuSkinInstaller(configuration, {
    skinWriter: new OsuSkinWriter(osuTemplatesPath),
    configWriter: {
      prepareUpdate: prepareOsuUserConfigurationUpdate,
      writeUpdate: writeOsuUserConfigurationUpdate,
    },
    publisher: new TransactionalOutputSetPublisher(),
  })
}

export async function runEtternaToOsuRoute(
  dependencies: Partial<EtternaToOsuRouteDependencies> = {},
): Promise<void> {
  const resolved = { ...defaultDependencies, ...dependencies }
  const gameLocation = await resolved.resolveInstallationDirectory(
    resolved.etternaDefaultLocation,
    "Etterna was not found. Press any key to select its installation folder.",
  )
  if (!gameLocation) return

  const selectedProfile = await resolved.selectEtternaProfile(
    await resolved.listEtternaProfiles(gameLocation),
  )
  if (!selectedProfile) return
  const theme = await resolved.readEtternaTheme(gameLocation)
  const skins = await resolved.listSkins(gameLocation)
  const selectedPath = await resolved.selectSkin(
    "Select the skin to convert:",
    skins.map((skin) => ({ value: skin.sourcePath, label: skin.name })),
  )
  if (!selectedPath) return
  const reference = skins.find((skin) => skin.sourcePath === selectedPath)
  if (!reference) throw new Error("Selected skin is not available")

  const osuLocation = await resolved.resolveInstallationDirectory(
    resolved.resolveDefaultOsuInstallationDirectory(resolved.localAppData),
    "osu! was not found. Press any key to select its installation folder.",
  )
  if (!osuLocation) return

  const installer = resolved.createInstaller({
    gameRoot: osuLocation,
    windowsUsername: resolved.windowsUsername,
    expectedSkinName: reference.name,
    skinTarget: resolved.resolveOsuSkinOutputPath(reference.name, osuLocation),
  })
  const result = await convertEtternaSkin(
    reference,
    selectedProfile,
    theme,
    installer,
    dependencies.convertAndInstallSkin,
  )
  for (const diagnostic of result.diagnostics) {
    const direction = diagnostic.direction ? ` [${diagnostic.direction}]` : ""
    resolved.warn(
      `${diagnostic.severity.toUpperCase()} ${diagnostic.component}${direction}: ${diagnostic.message}`,
    )
  }
  await resolved.waitForAnyKey("✨ Migration complete! Now all you have to do is launch the game.")
}

async function convertEtternaSkin(
  reference: SkinReference,
  profileId: string,
  theme: string,
  installer: SkinInstaller,
  injectedConvertAndInstallSkin: EtternaToOsuRouteDependencies["convertAndInstallSkin"] | undefined,
) {
  const request = { reference, targetGame: "osu" } as const
  if (injectedConvertAndInstallSkin) return injectedConvertAndInstallSkin(request)
  return convertAndInstallSkin(request, {
    readers: new Map([["etterna", new EtternaSkinReader({ profileId, theme })]]),
    installers: new Map([["osu", installer]]),
    conversions: new ConversionRegistry([new EtternaToOsuConversion()]),
  })
}

export async function selectEtternaProfile(
  profiles: readonly EtternaProfile[],
  selectProfile: SelectProfile,
): Promise<string | undefined> {
  if (profiles.length === 1) return profiles[0]?.id
  const selectedProfileId = await selectProfile(
    "Select the Etterna profile:",
    profiles.map((profile) => ({
      value: profile.id,
      label: profile.displayName,
      hint: profile.id,
    })),
  )
  if (!selectedProfileId) return undefined
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId)
  if (!selectedProfile) throw new Error("Selected Etterna profile is not available")
  return selectedProfile.id
}
