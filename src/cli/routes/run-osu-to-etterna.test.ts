import assert from "node:assert/strict"
import test from "node:test"
import type { OsuUserConfiguration } from "../../adapters/osu/config/osu-user-configuration.ts"
import type { ConvertAndInstallSkinRequest } from "../../application/conversion/convert-and-install-skin.ts"
import type { SkinInstaller } from "../../application/ports/skin-installer.ts"
import type { SkinReader } from "../../application/ports/skin-reader.ts"
import type { SkinReference } from "../../domain/skin.ts"
import {
  type OsuToEtternaRouteDependencies,
  runOsuToEtternaRoute,
  selectOsuUserConfiguration,
} from "./run-osu-to-etterna.ts"

const configuration: OsuUserConfiguration = {
  filePath: "C:/Games/osu!/osu!.Alice.cfg",
  username: "Alice",
  width: 1920,
  height: 1080,
  useDoubleResolutionAssets: true,
}
const skin: SkinReference = {
  game: "osu",
  name: "General Name",
  sourcePath: "C:/Games/osu!/Skins/Folder Name",
  gameRoot: "C:/Games/osu!",
}

test("runs the osu to Etterna route in selection order and formats diagnostics", async () => {
  const events: string[] = []
  let readerConfiguration: OsuUserConfiguration | undefined
  let installerConfiguration:
    | {
        gameRoot: string
        profileName: string
        theme: string
        expectedNoteSkinName: string
        overwriteExistingNoteSkin: boolean
      }
    | undefined
  let request: ConvertAndInstallSkinRequest | undefined
  const dependencies: OsuToEtternaRouteDependencies = {
    localAppData: "C:/Users/Alice/AppData/Local",
    resolveDefaultOsuInstallationDirectory: (localAppData) => {
      events.push(`osu-default:${localAppData}`)
      return "C:/Games/osu!"
    },
    etternaDefaultLocation: "C:/Games/Etterna",
    resolveInstallationDirectory: async (defaultDirectory, prompt) => {
      events.push(`resolve:${defaultDirectory}:${prompt}`)
      return defaultDirectory
    },
    listOsuUserConfigurations: async (osuRoot) => {
      events.push(`configurations:${osuRoot}`)
      return [configuration]
    },
    selectOsuUserConfiguration: async (configurations) => {
      events.push(`configuration:${configurations[0]?.username}`)
      return configuration
    },
    listSkins: async (osuRoot) => {
      events.push(`skins:${osuRoot}`)
      return [skin]
    },
    selectSkin: async (message, options) => {
      events.push(`select:${message}:${options[0]?.label}`)
      return skin.sourcePath
    },
    readEtternaTheme: async (etternaRoot) => {
      events.push(`theme:${etternaRoot}`)
      return "Til Death"
    },
    resolveEtternaNoteSkinPath: (etternaRoot, skinName) => {
      events.push(`noteskin-path:${etternaRoot}:${skinName}`)
      return "C:/Games/Etterna/NoteSkins/dance/General Name"
    },
    noteSkinExists: async (target) => {
      events.push(`noteskin-exists:${target}`)
      return false
    },
    askConfirm: async () => assert.fail("absent NoteSkin must not prompt for overwrite"),
    createReader: (selectedConfiguration) => {
      events.push(`reader:${selectedConfiguration.useDoubleResolutionAssets}`)
      readerConfiguration = selectedConfiguration
      return {} as SkinReader
    },
    createInstaller: (selectedConfiguration) => {
      events.push(`installer:${selectedConfiguration.profileName}:${selectedConfiguration.theme}`)
      installerConfiguration = selectedConfiguration
      return {} as SkinInstaller
    },
    convertAndInstallSkin: async (conversionRequest) => {
      events.push("convert-install")
      request = conversionRequest
      return {
        diagnostics: [
          {
            code: "fixture.warning",
            severity: "warning",
            component: "receptor",
            direction: "right",
            message: "Fallback",
          },
        ],
      }
    },
    warn: (message) => events.push(`warn:${message}`),
  }

  await runOsuToEtternaRoute(dependencies)

  assert.equal(readerConfiguration, configuration)
  assert.deepEqual(installerConfiguration, {
    gameRoot: "C:/Games/Etterna",
    profileName: "Alice",
    theme: "Til Death",
    expectedNoteSkinName: "General Name",
    overwriteExistingNoteSkin: false,
  })
  assert.deepEqual(request, { reference: skin, targetGame: "etterna" })
  assert.deepEqual(events, [
    "osu-default:C:/Users/Alice/AppData/Local",
    "resolve:C:/Games/osu!:osu! was not found. Press any key to select its installation folder.",
    "configurations:C:/Games/osu!",
    "configuration:Alice",
    "skins:C:/Games/osu!",
    "select:Select the skin to convert::General Name",
    "resolve:C:/Games/Etterna:Etterna was not found. Press any key to select its installation folder.",
    "theme:C:/Games/Etterna",
    "noteskin-path:C:/Games/Etterna:General Name",
    "noteskin-exists:C:/Games/Etterna/NoteSkins/dance/General Name",
    "reader:true",
    "installer:Alice:Til Death",
    "convert-install",
    "warn:WARNING receptor [right]: Fallback",
  ])
})

test("declining an existing NoteSkin cancels before reader, installer, or publication", async () => {
  const events: string[] = []
  const dependencies = createDependencies({
    noteSkinExists: async () => true,
    askConfirm: async (message) => {
      events.push(`confirm:${message}`)
      return false
    },
    createReader: () => {
      events.push("reader")
      return {} as SkinReader
    },
    createInstaller: () => {
      events.push("installer")
      return {} as SkinInstaller
    },
    convertAndInstallSkin: async () => {
      events.push("convert-install")
      return { diagnostics: [] }
    },
  })

  await runOsuToEtternaRoute(dependencies)

  assert.deepEqual(events, ["confirm:General Name already exists. Overwrite it?"])
})

test("passes the selected name on every install and enables overwrite only after acceptance", async () => {
  let installerConfiguration:
    | { expectedNoteSkinName: string; overwriteExistingNoteSkin: boolean }
    | undefined
  const dependencies = createDependencies({
    noteSkinExists: async () => true,
    askConfirm: async () => true,
    createInstaller: (selectedConfiguration) => {
      installerConfiguration = selectedConfiguration
      return {} as SkinInstaller
    },
  })

  await runOsuToEtternaRoute(dependencies)

  assert.deepEqual(installerConfiguration, {
    gameRoot: "C:/Games/Etterna",
    profileName: "Alice",
    theme: "Til Death",
    expectedNoteSkinName: "General Name",
    overwriteExistingNoteSkin: true,
  })
})

test("selects the only osu configuration without prompting", async () => {
  let prompted = false
  const selected = await selectOsuUserConfiguration([configuration], async () => {
    prompted = true
    return undefined
  })
  assert.equal(selected, configuration)
  assert.equal(prompted, false)
})

test("selects osu configurations using Username labels and rejects unknown paths", async () => {
  const second = { ...configuration, filePath: "C:/Games/osu!/osu!.Bob.cfg", username: "Bob" }
  let options: { value: string; label: string }[] | undefined
  const selected = await selectOsuUserConfiguration(
    [configuration, second],
    async (_message, choices) => {
      options = choices
      return second.filePath
    },
  )
  assert.equal(selected, second)
  assert.deepEqual(options, [
    { value: configuration.filePath, label: "Alice" },
    { value: second.filePath, label: "Bob" },
  ])
  assert.equal(
    await selectOsuUserConfiguration([configuration, second], async () => undefined),
    undefined,
  )
  await assert.rejects(
    () => selectOsuUserConfiguration([configuration, second], async () => "C:/outside.cfg"),
    /selected osu! user configuration is not available/i,
  )
})

function createDependencies(
  overrides: Partial<OsuToEtternaRouteDependencies> = {},
): OsuToEtternaRouteDependencies {
  return {
    localAppData: undefined,
    resolveDefaultOsuInstallationDirectory: () => "C:/Games/osu!",
    etternaDefaultLocation: "C:/Games/Etterna",
    resolveInstallationDirectory: async (directory) => directory,
    listOsuUserConfigurations: async () => [configuration],
    selectOsuUserConfiguration: async () => configuration,
    listSkins: async () => [skin],
    selectSkin: async () => skin.sourcePath,
    readEtternaTheme: async () => "Til Death",
    resolveEtternaNoteSkinPath: () => "C:/Games/Etterna/NoteSkins/dance/General Name",
    noteSkinExists: async () => false,
    askConfirm: async () => true,
    createReader: () => ({}) as SkinReader,
    createInstaller: () => ({}) as SkinInstaller,
    convertAndInstallSkin: async () => ({ diagnostics: [] }),
    warn: () => {},
    ...overrides,
  }
}
