import path from "node:path"
import type { OutputSetPublisher } from "../../../application/ports/output-set-publisher.ts"
import type { SkinInstaller } from "../../../application/ports/skin-installer.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import type { PreparedOsuUserConfigurationUpdate } from "../config/prepare-osu-user-configuration-update.ts"
import type { OsuSkinWriter } from "../writer/osu-skin-writer.ts"

export interface OsuSkinInstallerConfiguration {
  readonly gameRoot: string
  readonly windowsUsername: string | undefined
  readonly expectedSkinName: string
  readonly skinTarget: string
}

export interface OsuSkinInstallerDependencies {
  readonly skinWriter: Pick<OsuSkinWriter, "writeSkin">
  readonly configWriter: {
    prepareUpdate(
      gameRoot: string,
      windowsUsername: string | undefined,
      maniaSpeed: number,
    ): Promise<PreparedOsuUserConfigurationUpdate>
    writeUpdate(outputFile: string, update: PreparedOsuUserConfigurationUpdate): Promise<void>
  }
  readonly publisher: OutputSetPublisher
}

export class OsuSkinInstaller implements SkinInstaller {
  readonly game = "osu"
  readonly #configuration: OsuSkinInstallerConfiguration
  readonly #dependencies: OsuSkinInstallerDependencies

  constructor(
    configuration: OsuSkinInstallerConfiguration,
    dependencies: OsuSkinInstallerDependencies,
  ) {
    this.#configuration = configuration
    this.#dependencies = dependencies
  }

  async installSkin(skin: SkinModel): Promise<void> {
    if (skin.game !== this.game) {
      throw new Error(`osu! installer cannot install a ${skin.game} skin`)
    }
    if (skin.metadata.name !== this.#configuration.expectedSkinName) {
      throw new Error(
        `Converted skin name ${JSON.stringify(skin.metadata.name)} does not match the expected skin name ${JSON.stringify(this.#configuration.expectedSkinName)}`,
      )
    }

    const update = await this.#dependencies.configWriter.prepareUpdate(
      this.#configuration.gameRoot,
      this.#configuration.windowsUsername,
      skin.playfield.scrollSpeed,
    )

    await this.#dependencies.publisher.publish([
      {
        kind: "directory",
        targetPath: this.#configuration.skinTarget,
        allowedRoot: path.join(this.#configuration.gameRoot, "Skins"),
        policy: "replace-existing",
        build: (workspace) => this.#dependencies.skinWriter.writeSkin(skin, workspace),
      },
      {
        kind: "file",
        targetPath: update.targetPath,
        allowedRoot: this.#configuration.gameRoot,
        policy: "replace-existing",
        expectedContent: update.expectation,
        build: (stagingFile) => this.#dependencies.configWriter.writeUpdate(stagingFile, update),
      },
    ])
  }
}
