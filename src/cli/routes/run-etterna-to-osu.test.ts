import assert from "node:assert/strict"
import test from "node:test"
import type { EtternaProfile } from "../../adapters/etterna/profile/etterna-profile-catalog.ts"
import type { ConvertSkinRequest } from "../../application/conversion/convert-skin.ts"
import type { SkinReference } from "../../domain/skin.ts"
import {
  type EtternaToOsuRouteDependencies,
  runEtternaToOsuRoute,
  selectEtternaProfile,
} from "./run-etterna-to-osu.ts"

const profiles: EtternaProfile[] = [{ id: "00000003", displayName: "Alice" }]
const skin: SkinReference = {
  game: "etterna",
  name: "Diamond",
  sourcePath: "C:/Games/Etterna/NoteSkins/dance/Diamond",
  gameRoot: "C:/Games/Etterna",
}

test("preserves the Etterna to osu route order, prompts, output path, and diagnostics", async () => {
  const events: string[] = []
  let conversionRequest: ConvertSkinRequest | undefined
  let selectedOptions: { value: string; label: string }[] | undefined
  const dependencies: EtternaToOsuRouteDependencies = {
    etternaDefaultLocation: "C:/Games/Etterna",
    localAppData: "C:/Users/Alice/AppData/Local",
    resolveInstallationDirectory: async (defaultDirectory, prompt) => {
      events.push(`resolve:${defaultDirectory}:${prompt}`)
      return defaultDirectory?.includes("Etterna") ? "C:/Games/Etterna" : "C:/Users/Alice/osu!"
    },
    listEtternaProfiles: async (gameRoot) => {
      events.push(`profiles:${gameRoot}`)
      return profiles
    },
    selectEtternaProfile: async (catalog) => {
      events.push(`profile:${catalog[0]?.displayName}`)
      return "00000003"
    },
    readEtternaTheme: async (gameRoot) => {
      events.push(`theme:${gameRoot}`)
      return "Til Death"
    },
    listSkins: async (gameRoot) => {
      events.push(`skins:${gameRoot}`)
      return [skin]
    },
    selectSkin: async (message, options) => {
      events.push(`select:${message}`)
      selectedOptions = options
      return skin.sourcePath
    },
    resolveDefaultOsuInstallationDirectory: (localAppData) => {
      events.push(`osu-default:${localAppData}`)
      return "C:/Users/Alice/osu!"
    },
    resolveOsuSkinOutputPath: (skinName, gameRoot) => {
      events.push(`output:${skinName}:${gameRoot}`)
      return "C:/Users/Alice/osu!/Skins/Diamond"
    },
    convertSkin: async (request) => {
      events.push("convert")
      conversionRequest = request
      return {
        diagnostics: [
          {
            code: "fixture.warning",
            severity: "warning",
            component: "receptor",
            direction: "left",
            message: "Used fallback",
          },
        ],
      }
    },
    warn: (message) => events.push(`warn:${message}`),
  }

  await runEtternaToOsuRoute(dependencies)

  assert.deepEqual(selectedOptions, [{ value: skin.sourcePath, label: "Diamond" }])
  assert.deepEqual(conversionRequest, {
    reference: skin,
    targetGame: "osu",
    outputDirectory: "C:/Users/Alice/osu!/Skins/Diamond",
  })
  assert.deepEqual(events, [
    "resolve:C:/Games/Etterna:Etterna was not found. Press any key to select its installation folder.",
    "profiles:C:/Games/Etterna",
    "profile:Alice",
    "theme:C:/Games/Etterna",
    "skins:C:/Games/Etterna",
    "select:Select the skin to convert:",
    "osu-default:C:/Users/Alice/AppData/Local",
    "resolve:C:/Users/Alice/osu!:osu! was not found. Press any key to select its installation folder.",
    "output:Diamond:C:/Users/Alice/osu!",
    "convert",
    "warn:WARNING receptor [left]: Used fallback",
  ])
})

test("stops at each cancelled Etterna to osu route selection", async () => {
  const cancellationPoints = ["source-location", "profile", "skin", "target-location"] as const

  for (const cancellationPoint of cancellationPoints) {
    let converted = false
    const dependencies: EtternaToOsuRouteDependencies = {
      etternaDefaultLocation: "C:/Games/Etterna",
      localAppData: undefined,
      resolveInstallationDirectory: async (defaultDirectory) => {
        if (cancellationPoint === "source-location" && defaultDirectory === "C:/Games/Etterna") {
          return undefined
        }
        if (cancellationPoint === "target-location" && defaultDirectory === "C:/osu!") {
          return undefined
        }
        return defaultDirectory
      },
      listEtternaProfiles: async () => profiles,
      selectEtternaProfile: async () => (cancellationPoint === "profile" ? undefined : "00000003"),
      readEtternaTheme: async () => "Til Death",
      listSkins: async () => [skin],
      selectSkin: async () => (cancellationPoint === "skin" ? undefined : skin.sourcePath),
      resolveDefaultOsuInstallationDirectory: () => "C:/osu!",
      resolveOsuSkinOutputPath: () => "C:/osu!/Skins/Diamond",
      convertSkin: async () => {
        converted = true
        return { diagnostics: [] }
      },
      warn: () => {},
    }

    await runEtternaToOsuRoute(dependencies)
    assert.equal(converted, false, `must not convert after ${cancellationPoint} cancellation`)
  }
})

test("selects the only Etterna profile without prompting", async () => {
  let prompted = false
  const selected = await selectEtternaProfile(profiles, async () => {
    prompted = true
    return undefined
  })

  assert.equal(selected, "00000003")
  assert.equal(prompted, false)
})

test("rejects an Etterna profile selection outside the discovered catalog", async () => {
  await assert.rejects(
    () =>
      selectEtternaProfile(
        [
          { id: "00000000", displayName: "Alice" },
          { id: "00000001", displayName: "Bob" },
        ],
        async () => "../outside",
      ),
    /selected Etterna profile is not available/i,
  )
})
