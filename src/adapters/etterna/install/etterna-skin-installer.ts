import path from "node:path"
import type { OutputSetPublisher } from "../../../application/ports/output-set-publisher.ts"
import type { SkinInstaller } from "../../../application/ports/skin-installer.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import type { PreparedEtternaAssetsConfigUpdate } from "../assets/prepare-etterna-assets-config-update.ts"
import {
  getEtternaJudgementFilename,
  getEtternaJudgementRelativePath,
} from "../judgements/etterna-judgement-output.ts"
import type { EtternaProfileIdentity } from "../profile/allocate-etterna-profile-identity.ts"
import {
  resolveEtternaJudgementPath,
  resolveEtternaJudgmentsPath,
  resolveEtternaNoteSkinPath,
  resolveEtternaProfilePath,
  resolveEtternaProfilesPath,
  resolveEtternaThemeSettingsPath,
} from "../settings/etterna-settings-paths.ts"
import type { EtternaJudgementWriter } from "../writer/etterna-judgement-writer.ts"
import type { EtternaNoteSkinWriter } from "../writer/etterna-note-skin-writer.ts"
import type { EtternaProfileWriter } from "../writer/etterna-profile-writer.ts"

export interface EtternaSkinInstallerConfiguration {
  readonly gameRoot: string
  readonly profileName: string
  readonly theme: string
  readonly expectedNoteSkinName: string
  readonly overwriteExistingNoteSkin: boolean
}

export interface EtternaSkinInstallerDependencies {
  allocateProfileIdentity(gameRoot: string): Promise<EtternaProfileIdentity>
  readonly noteSkinWriter: Pick<EtternaNoteSkinWriter, "writeSkin">
  readonly profileWriter: Pick<EtternaProfileWriter, "writeProfile">
  readonly judgementWriter: Pick<EtternaJudgementWriter, "writeJudgement">
  readonly assetsConfigWriter: {
    prepareUpdate(
      filePath: string,
      guid: string,
      judgementPath: string,
    ): Promise<PreparedEtternaAssetsConfigUpdate>
    writeUpdate(outputFile: string, update: PreparedEtternaAssetsConfigUpdate): Promise<void>
  }
  readonly publisher: OutputSetPublisher
}

export class EtternaSkinInstaller implements SkinInstaller {
  readonly game = "etterna"
  readonly #configuration: EtternaSkinInstallerConfiguration
  readonly #dependencies: EtternaSkinInstallerDependencies

  constructor(
    configuration: EtternaSkinInstallerConfiguration,
    dependencies: EtternaSkinInstallerDependencies,
  ) {
    this.#configuration = configuration
    this.#dependencies = dependencies
  }

  async installSkin(skin: SkinModel): Promise<void> {
    if (skin.game !== this.game) {
      throw new Error(`Etterna installer cannot install a ${skin.game} skin`)
    }
    if (skin.metadata.name !== this.#configuration.expectedNoteSkinName) {
      throw new Error(
        `Converted NoteSkin name ${JSON.stringify(skin.metadata.name)} does not match the expected NoteSkin name ${JSON.stringify(this.#configuration.expectedNoteSkinName)}`,
      )
    }
    const judgements = skin.assets.judgements
    if (!judgements) {
      throw new Error("Etterna skin model does not contain judgements")
    }

    const noteSkinsRoot = path.join(this.#configuration.gameRoot, "NoteSkins", "dance")
    const noteSkinTarget = resolveEtternaNoteSkinPath(
      this.#configuration.gameRoot,
      skin.metadata.name,
    )
    const identity = await this.#dependencies.allocateProfileIdentity(this.#configuration.gameRoot)
    const profilesRoot = resolveEtternaProfilesPath(this.#configuration.gameRoot)
    const profileTarget = resolveEtternaProfilePath(this.#configuration.gameRoot, identity.id)
    const judgementFilename = getEtternaJudgementFilename(
      skin.metadata.name,
      identity.guid,
      judgements.sourceDensity,
    )
    const judgmentsRoot = resolveEtternaJudgmentsPath(this.#configuration.gameRoot)
    const judgementTarget = resolveEtternaJudgementPath(
      this.#configuration.gameRoot,
      judgementFilename,
    )
    const themeSettingsRoot = resolveEtternaThemeSettingsPath(
      this.#configuration.gameRoot,
      this.#configuration.theme,
    )
    const assetsConfigTarget = path.join(themeSettingsRoot, "assetsConfig.lua")
    const assetsConfigUpdate = await this.#dependencies.assetsConfigWriter.prepareUpdate(
      assetsConfigTarget,
      identity.guid,
      getEtternaJudgementRelativePath(judgementFilename),
    )

    await this.#dependencies.publisher.publish([
      {
        kind: "directory",
        targetPath: noteSkinTarget,
        allowedRoot: noteSkinsRoot,
        policy: this.#configuration.overwriteExistingNoteSkin
          ? "replace-existing"
          : "must-not-exist",
        build: async (workspace) => this.#dependencies.noteSkinWriter.writeSkin(skin, workspace),
      },
      {
        kind: "directory",
        targetPath: profileTarget,
        allowedRoot: profilesRoot,
        policy: "must-not-exist",
        build: async (workspace) =>
          this.#dependencies.profileWriter.writeProfile(skin, workspace, {
            profileName: this.#configuration.profileName,
            guid: identity.guid,
            theme: this.#configuration.theme,
          }),
      },
      {
        kind: "file",
        targetPath: judgementTarget,
        allowedRoot: judgmentsRoot,
        policy: "must-not-exist",
        build: async (stagingFile) =>
          this.#dependencies.judgementWriter.writeJudgement(skin, stagingFile),
      },
      {
        kind: "file",
        targetPath: assetsConfigTarget,
        allowedRoot: themeSettingsRoot,
        policy: "replace-existing",
        expectedContent: assetsConfigUpdate.expectation,
        build: async (stagingFile) =>
          this.#dependencies.assetsConfigWriter.writeUpdate(stagingFile, assetsConfigUpdate),
      },
    ])
  }
}
