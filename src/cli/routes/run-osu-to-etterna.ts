import path from "node:path"
import {
  prepareEtternaAssetsConfigUpdate,
  writeEtternaAssetsConfigUpdate,
} from "../../adapters/etterna/assets/prepare-etterna-assets-config-update.ts"
import {
  EtternaSkinInstaller,
  type EtternaSkinInstallerConfiguration,
  type EtternaSkinInstallerDependencies,
} from "../../adapters/etterna/install/etterna-skin-installer.ts"
import { allocateEtternaProfileIdentity } from "../../adapters/etterna/profile/allocate-etterna-profile-identity.ts"
import { resolveEtternaNoteSkinPath } from "../../adapters/etterna/settings/etterna-settings-paths.ts"
import { readEtternaTheme } from "../../adapters/etterna/theme/read-etterna-theme.ts"
import { EtternaJudgementWriter } from "../../adapters/etterna/writer/etterna-judgement-writer.ts"
import { EtternaNoteSkinWriter } from "../../adapters/etterna/writer/etterna-note-skin-writer.ts"
import { EtternaProfileWriter } from "../../adapters/etterna/writer/etterna-profile-writer.ts"
import { OsuSkinCatalog } from "../../adapters/osu/catalog/osu-skin-catalog.ts"
import {
  listOsuUserConfigurations,
  type OsuUserConfiguration,
} from "../../adapters/osu/config/osu-user-configuration.ts"
import { OsuSkinReader } from "../../adapters/osu/reader/osu-skin-reader.ts"
import { ConversionRegistry } from "../../application/conversion/conversion-registry.ts"
import {
  type ConvertAndInstallSkinRequest,
  convertAndInstallSkin,
} from "../../application/conversion/convert-and-install-skin.ts"
import type { SkinInstaller } from "../../application/ports/skin-installer.ts"
import type { SkinReader } from "../../application/ports/skin-reader.ts"
import { gameDefaults } from "../../config/game-defaults.ts"
import { resolveDefaultOsuInstallationDirectory } from "../../config/osu-installation.ts"
import { etternaTemplatesPath } from "../../config/paths.ts"
import { OsuToEtternaConversion } from "../../conversions/osu-to-etterna/osu-to-etterna-conversion.ts"
import type { SkinReference } from "../../domain/skin.ts"
import { TransactionalOutputSetPublisher } from "../../infrastructure/filesystem/transactional-output-set-publisher.ts"
import { pickDirectory } from "../folder-picker.ts"
import {
  directoryExists,
  type InstallationDirectoryDependencies,
  resolveInstallationDirectory,
} from "../installation-directory.ts"
import { askConfirm, askSelect, type SelectOption, waitForAnyKey } from "../prompts.ts"

export type EtternaInstallerRouteConfiguration = EtternaSkinInstallerConfiguration

export interface OsuToEtternaRouteDependencies {
  readonly localAppData: string | undefined
  resolveDefaultOsuInstallationDirectory(localAppData: string | undefined): string | undefined
  readonly etternaDefaultLocation: string
  resolveInstallationDirectory(
    defaultDirectory: string | undefined,
    prompt: string,
  ): Promise<string | undefined>
  listOsuUserConfigurations(osuRoot: string): Promise<OsuUserConfiguration[]>
  selectOsuUserConfiguration(
    configurations: readonly OsuUserConfiguration[],
  ): Promise<OsuUserConfiguration | undefined>
  listSkins(osuRoot: string): Promise<SkinReference[]>
  selectSkin(message: string, options: SelectOption[]): Promise<string | undefined>
  readEtternaTheme(etternaRoot: string): Promise<string>
  resolveEtternaNoteSkinPath(etternaRoot: string, skinName: string): string
  noteSkinExists(targetDirectory: string): Promise<boolean>
  askConfirm(message: string): Promise<boolean | undefined>
  createReader(configuration: OsuUserConfiguration): SkinReader
  createInstaller(configuration: EtternaInstallerRouteConfiguration): SkinInstaller
  convertAndInstallSkin(
    request: ConvertAndInstallSkinRequest,
  ): ReturnType<typeof convertAndInstallSkin>
  warn(message: string): void
}

type SelectConfiguration = (message: string, options: SelectOption[]) => Promise<string | undefined>

const installationDirectoryDependencies: InstallationDirectoryDependencies = {
  directoryExists,
  waitForAnyKey,
  pickDirectory,
}

const defaultDependencies: OsuToEtternaRouteDependencies = {
  localAppData: process.env.LOCALAPPDATA,
  resolveDefaultOsuInstallationDirectory,
  etternaDefaultLocation: gameDefaults.etterna.location,
  resolveInstallationDirectory: (defaultDirectory, prompt) =>
    resolveInstallationDirectory(defaultDirectory, prompt, installationDirectoryDependencies),
  listOsuUserConfigurations,
  selectOsuUserConfiguration: (configurations) =>
    selectOsuUserConfiguration(configurations, askSelect),
  listSkins: (osuRoot) => new OsuSkinCatalog().listSkins(osuRoot),
  selectSkin: askSelect,
  readEtternaTheme,
  resolveEtternaNoteSkinPath,
  noteSkinExists: directoryExists,
  askConfirm,
  createReader: (configuration) =>
    new OsuSkinReader({ useDoubleResolutionAssets: configuration.useDoubleResolutionAssets }),
  createInstaller: createDefaultEtternaInstaller,
  convertAndInstallSkin: (request) =>
    convertAndInstallSkin(request, {
      readers: new Map(),
      installers: new Map(),
      conversions: new ConversionRegistry([new OsuToEtternaConversion()]),
    }),
  warn: console.warn,
}

export function createDefaultEtternaInstaller(
  configuration: EtternaSkinInstallerConfiguration,
  dependencies: Pick<EtternaSkinInstallerDependencies, "allocateProfileIdentity"> = {
    allocateProfileIdentity: allocateEtternaProfileIdentity,
  },
): EtternaSkinInstaller {
  return new EtternaSkinInstaller(configuration, {
    allocateProfileIdentity: dependencies.allocateProfileIdentity,
    noteSkinWriter: new EtternaNoteSkinWriter(path.join(etternaTemplatesPath, "noteskin")),
    profileWriter: new EtternaProfileWriter(path.join(etternaTemplatesPath, "profile")),
    judgementWriter: new EtternaJudgementWriter(),
    assetsConfigWriter: {
      prepareUpdate: prepareEtternaAssetsConfigUpdate,
      writeUpdate: writeEtternaAssetsConfigUpdate,
    },
    publisher: new TransactionalOutputSetPublisher(),
  })
}

export async function runOsuToEtternaRoute(
  dependencies: OsuToEtternaRouteDependencies = defaultDependencies,
): Promise<void> {
  const osuRoot = await dependencies.resolveInstallationDirectory(
    dependencies.resolveDefaultOsuInstallationDirectory(dependencies.localAppData),
    "osu! was not found. Press any key to select its installation folder.",
  )
  if (!osuRoot) return
  const configuration = await dependencies.selectOsuUserConfiguration(
    await dependencies.listOsuUserConfigurations(osuRoot),
  )
  if (!configuration) return

  const skins = await dependencies.listSkins(osuRoot)
  const selectedPath = await dependencies.selectSkin(
    "Select the skin to convert:",
    skins.map((skin) => ({ value: skin.sourcePath, label: skin.name })),
  )
  if (!selectedPath) return
  const reference = skins.find((skin) => skin.sourcePath === selectedPath)
  if (!reference) throw new Error("Selected skin is not available")

  const etternaRoot = await dependencies.resolveInstallationDirectory(
    dependencies.etternaDefaultLocation,
    "Etterna was not found. Press any key to select its installation folder.",
  )
  if (!etternaRoot) return
  const theme = await dependencies.readEtternaTheme(etternaRoot)
  const noteSkinTarget = dependencies.resolveEtternaNoteSkinPath(etternaRoot, reference.name)
  const exists = await dependencies.noteSkinExists(noteSkinTarget)
  if (exists && !(await dependencies.askConfirm(`${reference.name} already exists. Overwrite it?`)))
    return

  const reader = dependencies.createReader(configuration)
  const installer = dependencies.createInstaller({
    gameRoot: etternaRoot,
    profileName: configuration.username,
    theme,
    expectedNoteSkinName: reference.name,
    overwriteExistingNoteSkin: exists,
  })
  const result = await runConversion(reference, reader, installer, dependencies)
  for (const diagnostic of result.diagnostics) {
    const direction = diagnostic.direction ? ` [${diagnostic.direction}]` : ""
    dependencies.warn(
      `${diagnostic.severity.toUpperCase()} ${diagnostic.component}${direction}: ${diagnostic.message}`,
    )
  }
}

async function runConversion(
  reference: SkinReference,
  reader: SkinReader,
  installer: SkinInstaller,
  dependencies: OsuToEtternaRouteDependencies,
) {
  if (dependencies === defaultDependencies) {
    return convertAndInstallSkin(
      { reference, targetGame: "etterna" },
      {
        readers: new Map([["osu", reader]]),
        installers: new Map([["etterna", installer]]),
        conversions: new ConversionRegistry([new OsuToEtternaConversion()]),
      },
    )
  }
  return dependencies.convertAndInstallSkin({ reference, targetGame: "etterna" })
}

export async function selectOsuUserConfiguration(
  configurations: readonly OsuUserConfiguration[],
  selectConfiguration: SelectConfiguration,
): Promise<OsuUserConfiguration | undefined> {
  if (configurations.length === 1) return configurations[0]
  const selectedPath = await selectConfiguration(
    "Select the osu! user configuration:",
    configurations.map((configuration) => ({
      value: configuration.filePath,
      label: configuration.username,
    })),
  )
  if (!selectedPath) return undefined
  const selected = configurations.find((configuration) => configuration.filePath === selectedPath)
  if (!selected) throw new Error("Selected osu! user configuration is not available")
  return selected
}
