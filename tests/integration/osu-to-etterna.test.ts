import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import {
  prepareEtternaAssetsConfigUpdate,
  writeEtternaAssetsConfigUpdate,
} from "../../src/adapters/etterna/assets/prepare-etterna-assets-config-update.ts"
import {
  EtternaSkinInstaller,
  type EtternaSkinInstallerConfiguration,
} from "../../src/adapters/etterna/install/etterna-skin-installer.ts"
import { allocateEtternaProfileIdentity } from "../../src/adapters/etterna/profile/allocate-etterna-profile-identity.ts"
import { resolveEtternaNoteSkinPath } from "../../src/adapters/etterna/settings/etterna-settings-paths.ts"
import { readEtternaTheme } from "../../src/adapters/etterna/theme/read-etterna-theme.ts"
import { EtternaJudgementWriter } from "../../src/adapters/etterna/writer/etterna-judgement-writer.ts"
import { EtternaNoteSkinWriter } from "../../src/adapters/etterna/writer/etterna-note-skin-writer.ts"
import { EtternaProfileWriter } from "../../src/adapters/etterna/writer/etterna-profile-writer.ts"
import { OsuSkinCatalog } from "../../src/adapters/osu/catalog/osu-skin-catalog.ts"
import {
  listOsuUserConfigurations,
  type OsuUserConfiguration,
} from "../../src/adapters/osu/config/osu-user-configuration.ts"
import { OsuSkinReader } from "../../src/adapters/osu/reader/osu-skin-reader.ts"
import { ConversionRegistry } from "../../src/application/conversion/conversion-registry.ts"
import { convertAndInstallSkin } from "../../src/application/conversion/convert-and-install-skin.ts"
import type { SkinInstaller } from "../../src/application/ports/skin-installer.ts"
import type { SkinReader } from "../../src/application/ports/skin-reader.ts"
import {
  runOsuToEtternaRoute,
  selectOsuUserConfiguration,
} from "../../src/cli/routes/run-osu-to-etterna.ts"
import { etternaTemplatesPath } from "../../src/config/paths.ts"
import { OsuToEtternaConversion } from "../../src/conversions/osu-to-etterna/osu-to-etterna-conversion.ts"
import type { ColumnDirection } from "../../src/domain/image.ts"
import type { SkinReference } from "../../src/domain/skin.ts"
import {
  type TransactionalOutputSetFileSystem,
  TransactionalOutputSetPublisher,
} from "../../src/infrastructure/filesystem/transactional-output-set-publisher.ts"

const directions = ["left", "down", "up", "right"] as const
const directionTitles: Readonly<Record<ColumnDirection, string>> = {
  left: "Left",
  down: "Down",
  up: "Up",
  right: "Right",
}
const existingGuid = "aaaaaaaaaaaaaaaa"
const generatedGuid = "bbbbbbbbbbbbbbbb"
const receptorColors = {
  left: {
    normal: { r: 50, g: 120, b: 210 },
    pressed: { r: 220, g: 70, b: 90 },
  },
  down: {
    normal: { r: 70, g: 120, b: 210 },
    pressed: { r: 220, g: 90, b: 90 },
  },
  up: {
    normal: { r: 90, g: 120, b: 210 },
    pressed: { r: 220, g: 110, b: 90 },
  },
  right: {
    normal: { r: 110, g: 120, b: 210 },
    pressed: { r: 220, g: 130, b: 90 },
  },
} as const
const noteColors = {
  left: { r: 0, g: 80, b: 200 },
  down: { r: 40, g: 100, b: 200 },
  up: { r: 80, g: 120, b: 200 },
  right: { r: 120, g: 140, b: 200 },
} as const
const convertedReceptorHeights: Readonly<Record<ColumnDirection, number>> = {
  left: 158,
  down: 157,
  up: 156,
  right: 156,
}
const convertedReceptorLogicalHeights: Readonly<Record<ColumnDirection, number>> = {
  left: 69,
  down: 69,
  up: 68,
  right: 68,
}
const convertedNoteHeights: Readonly<Record<ColumnDirection, number>> = {
  left: 113,
  down: 117,
  up: 120,
  right: 123,
}
const convertedNoteLogicalHeights: Readonly<Record<ColumnDirection, number>> = {
  left: 48,
  down: 50,
  up: 51,
  right: 52,
}
const defaultReceptorColors = {
  edge: {
    normal: { r: 15, g: 85, b: 155 },
    pressed: { r: 205, g: 45, b: 105 },
  },
  middle: {
    normal: { r: 35, g: 105, b: 175 },
    pressed: { r: 225, g: 65, b: 125 },
  },
} as const
const defaultNoteColors = {
  edge: { r: 25, g: 95, b: 215 },
  middle: { r: 75, g: 145, b: 235 },
} as const
const defaultAssetGroupByDirection = {
  left: "edge",
  down: "middle",
  up: "middle",
  right: "edge",
} as const
const judgementFixtures = [
  { grade: "marvelous", width: 7, height: 3, color: [220, 20, 40, 255] },
  { grade: "perfect", width: 5, height: 4, color: [200, 80, 30, 255] },
  { grade: "great", width: 4, height: 2, color: [180, 140, 20, 255] },
  { grade: "good", width: 6, height: 1, color: [80, 180, 40, 255] },
  { grade: "bad", width: 3, height: 4, color: [40, 120, 210, 255] },
  { grade: "miss", width: 2, height: 3, color: [120, 60, 180, 255] },
] as const
const originalAssetsConfig = `-- preserve header
return {
  avatar = { default = "Assets/Avatars/default.png" },
  judgment = {
    -- preserve default
    default = "Assets/Judgments/default 1x6 (Doubleres).png",
  },
  toasty = { default = "Assets/Toasties/default" },
}
`

test("converts a high-resolution 4K osu! skin into an Etterna NoteSkin and profile", async () => {
  const fixture = await createFixture()
  try {
    const result = await convertFixture(fixture)
    const noteSkinDirectory = path.join(fixture.etternaRoot, "NoteSkins", "dance", fixture.skinName)
    const profileDirectory = path.join(fixture.etternaRoot, "Save", "LocalProfiles", "00000004")

    assert.deepEqual(result.diagnostics, [])
    await assertStaticNoteSkinTemplate(noteSkinDirectory)
    for (const direction of directions) {
      const title = directionTitles[direction]
      for (const [state, prefix] of [
        ["normal", "release"],
        ["pressed", "pressed"],
      ] as const) {
        const outputPath = path.join(
          noteSkinDirectory,
          "Receptors",
          `${prefix} ${title} (res 64x${convertedReceptorLogicalHeights[direction]}).png`,
        )
        const output = await sharp(outputPath)
          .raw()
          .ensureAlpha()
          .toBuffer({ resolveWithObject: true })

        assert.deepEqual(
          { width: output.info.width, height: output.info.height },
          { width: 146, height: convertedReceptorHeights[direction] },
        )
        const expectedColor = receptorColors[direction][state]
        assert.deepEqual(
          rgbaAt(
            output.data,
            output.info.width,
            Math.floor(output.info.width / 2),
            Math.floor(output.info.height / 2),
          ),
          [expectedColor.r, expectedColor.g, expectedColor.b, 255],
        )
      }

      const noteOutput = path.join(
        noteSkinDirectory,
        "Notes",
        `_${title} Tap Note (res 64x${convertedNoteLogicalHeights[direction]}).png`,
      )
      const output = await sharp(noteOutput)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
      assert.deepEqual(
        { width: output.info.width, height: output.info.height },
        { width: 150, height: convertedNoteHeights[direction] },
      )
      const expectedColor = noteColors[direction]
      assert.deepEqual(rgbaAt(output.data, output.info.width, 75, 75), [
        expectedColor.r,
        expectedColor.g,
        expectedColor.b,
        255,
      ])
    }

    assert.deepEqual((await readdir(path.join(noteSkinDirectory, "Receptors"))).sort(), [
      "pressed Down (res 64x69).png",
      "pressed Left (res 64x69).png",
      "pressed Right (res 64x68).png",
      "pressed Up (res 64x68).png",
      "release Down (res 64x69).png",
      "release Left (res 64x69).png",
      "release Right (res 64x68).png",
      "release Up (res 64x68).png",
    ])
    assert.deepEqual((await readdir(path.join(noteSkinDirectory, "Notes"))).sort(), [
      "_Down Tap Note (res 64x50).png",
      "_Left Tap Note (res 64x48).png",
      "_Right Tap Note (res 64x52).png",
      "_Up Tap Note (res 64x51).png",
    ])

    const editable = await readFile(path.join(profileDirectory, "Editable.ini"), "utf8")
    const xml = await readFile(path.join(profileDirectory, "Etterna.xml"), "utf8")
    const playerConfig = await readFile(
      path.join(profileDirectory, "Rebirth_settings", "playerConfig.lua"),
      "utf8",
    )
    assert.deepEqual((await readdir(profileDirectory)).sort(), [
      "Editable.ini",
      "Etterna.xml",
      "Rebirth_settings",
      "Type.ini",
    ])
    assert.deepEqual(
      await readFile(path.join(profileDirectory, "Type.ini")),
      await readFile(path.join(etternaTemplatesPath, "profile", "Type.ini")),
    )
    assert.match(editable, /DisplayName=Alice/)
    assert.match(xml, /<DisplayName>Alice<\/DisplayName>/)
    assert.match(xml, /<dance>C902, Reverse, Overhead, General Name<\/dance>/)
    const guid = /<Guid>([^<]+)<\/Guid>/.exec(xml)?.[1]
    assert.match(guid ?? "", /^[0-9a-f]{16}$/)
    assert.notEqual(guid, existingGuid)
    assert.match(playerConfig, /NoteFieldY= -2(?:,|\s)/)
    assert.match(playerConfig, /ComboY= 21(?:,|\s)/)
    assert.match(playerConfig, /JudgmentY= 40(?:,|\s)/)
    assert.match(playerConfig, /ReceptorSize= 106(?:,|\s)/)
    assert.match(playerConfig, /ComboZoom= 0\.5(?:,|\s)/)
    assert.ok(guid)
    const judgementFilename = `${fixture.skinName} - ${guid} 1x6 (Doubleres).png`
    const judgementDirectory = path.join(fixture.etternaRoot, "Assets", "Judgments")
    assert.deepEqual(await readdir(judgementDirectory), [judgementFilename])
    await assertJudgementSheet(path.join(judgementDirectory, judgementFilename))

    const assetsConfig = await readFile(fixture.assetsConfigPath, "utf8")
    assert.match(
      assetsConfig,
      new RegExp(`\\["${guid}"\\] = "Assets/Judgments/${escapeRegExp(judgementFilename)}"`),
    )
    for (const preserved of [
      "-- preserve header",
      'avatar = { default = "Assets/Avatars/default.png" }',
      "-- preserve default",
      'default = "Assets/Judgments/default 1x6 (Doubleres).png"',
      'toasty = { default = "Assets/Toasties/default" }',
    ]) {
      assert.equal(assetsConfig.includes(preserved), true, preserved)
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

for (const density of ["standard", "double"] as const) {
  test(`uses osu 4K default notes and receptors at ${density} density`, async () => {
    const fixture = await createFixture({
      customJudgements: "none",
      defaultManiaAssetDensity: density,
    })
    try {
      await convertFixture(fixture)
      const noteSkinDirectory = path.join(
        fixture.etternaRoot,
        "NoteSkins",
        "dance",
        fixture.skinName,
      )

      for (const direction of directions) {
        const title = directionTitles[direction]
        const assetGroup = defaultAssetGroupByDirection[direction]
        for (const [state, prefix] of [
          ["normal", "release"],
          ["pressed", "pressed"],
        ] as const) {
          const output = await sharp(
            path.join(noteSkinDirectory, "Receptors", `${prefix} ${title} (res 64x64).png`),
          )
            .raw()
            .ensureAlpha()
            .toBuffer({ resolveWithObject: true })
          const expectedColor = defaultReceptorColors[assetGroup][state]

          assert.deepEqual(rgbaAt(output.data, output.info.width, 73, 73), [
            expectedColor.r,
            expectedColor.g,
            expectedColor.b,
            255,
          ])
        }

        const noteOutput = await sharp(
          path.join(noteSkinDirectory, "Notes", `_${title} Tap Note (res 64x64).png`),
        )
          .raw()
          .ensureAlpha()
          .toBuffer({ resolveWithObject: true })
        const expectedNoteColor = defaultNoteColors[assetGroup]
        assert.deepEqual(rgbaAt(noteOutput.data, noteOutput.info.width, 75, 75), [
          expectedNoteColor.r,
          expectedNoteColor.g,
          expectedNoteColor.b,
          255,
        ])
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })
}

test("falls back to a standard-density required osu 4K default asset", async () => {
  const fixture = await createFixture({
    customJudgements: "none",
    defaultManiaAssetDensity: "double",
  })
  try {
    await rm(path.join(fixture.skinDirectory, "mania-note2@2x.png"))
    const note = defaultNoteColors.middle
    await writeSolidPng(path.join(fixture.skinDirectory, "mania-note2.png"), 12, 12, [
      note.r,
      note.g,
      note.b,
      255,
    ])

    await convertFixture(fixture)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("fails when both densities of a required osu 4K default asset are absent", async () => {
  const fixture = await createFixture({
    customJudgements: "none",
    defaultManiaAssetDensity: "double",
  })
  try {
    await rm(path.join(fixture.skinDirectory, "mania-note2@2x.png"))

    await assert.rejects(
      () => convertFixture(fixture),
      (error) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /tapNotes\.down.*mania-note2/i)
        assert.ok(error.cause instanceof Error)
        assert.match(error.cause.message, /mania-note2\.png.*not found/i)
        return true
      },
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("does not replace a missing explicit 4K asset with an available default", async () => {
  const fixture = await createFixture({
    customJudgements: "none",
    defaultManiaAssetDensity: "standard",
    useMissingExplicitNoteReference: true,
  })
  try {
    await assert.rejects(
      () => convertFixture(fixture),
      (error) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /tapNotes\.left.*missing-note/i)
        assert.ok(error.cause instanceof Error)
        assert.match(error.cause.message, /missing-note\.png.*not found/i)
        return true
      },
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("builds an @2x Etterna sheet entirely from the default when osu judgements are absent", async () => {
  const fixture = await createFixture({ customJudgements: "none" })
  try {
    await convertFixture(fixture)

    await assertFallbackJudgementSheet(
      path.join(
        fixture.etternaRoot,
        "Assets",
        "Judgments",
        `${fixture.skinName} - ${generatedGuid} 1x6 (Doubleres).png`,
      ),
      new Set(),
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("mixes extracted default frames with the custom osu judgements that exist", async () => {
  const fixture = await createFixture({ customJudgements: ["perfect"] })
  try {
    await convertFixture(fixture)

    await assertFallbackJudgementSheet(
      path.join(
        fixture.etternaRoot,
        "Assets",
        "Judgments",
        `${fixture.skinName} - ${generatedGuid} 1x6 (Doubleres).png`,
      ),
      new Set(["perfect"]),
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("preserves downscroll by omitting Reverse from the generated Etterna profile", async () => {
  const fixture = await createFixture({ upsideDown: 1 })
  try {
    await convertFixture(fixture)
    const xml = await readFile(
      path.join(fixture.etternaRoot, "Save", "LocalProfiles", "00000004", "Etterna.xml"),
      "utf8",
    )
    const dance = /<dance>([^<]+)<\/dance>/.exec(xml)?.[1]

    assert.match(dance ?? "", /^C902,\s+Overhead, General Name$/)
    assert.doesNotMatch(dance ?? "", /\bReverse\b/)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("declining an overwrite leaves the NoteSkin unchanged and creates no profile", async () => {
  const fixture = await createFixture()
  const noteSkinDirectory = path.join(fixture.etternaRoot, "NoteSkins", "dance", fixture.skinName)
  const markerPath = path.join(noteSkinDirectory, "existing.txt")
  try {
    await mkdir(noteSkinDirectory, { recursive: true })
    await writeFile(markerPath, "keep me")
    const configurations = await listOsuUserConfigurations(fixture.osuRoot)
    const references = await new OsuSkinCatalog().listSkins(fixture.osuRoot)
    let confirmationMessage: string | undefined

    await runOsuToEtternaRoute({
      localAppData: fixture.root,
      resolveDefaultOsuInstallationDirectory: () => fixture.osuRoot,
      etternaDefaultLocation: fixture.etternaRoot,
      resolveInstallationDirectory: async (defaultDirectory) => defaultDirectory,
      listOsuUserConfigurations: async () => configurations,
      selectOsuUserConfiguration: async (options) =>
        selectOsuUserConfiguration(options, async () => assert.fail("single CFG must not prompt")),
      listSkins: async () => references,
      selectSkin: async () => references[0]?.sourcePath,
      readEtternaTheme,
      resolveEtternaNoteSkinPath,
      noteSkinExists: pathExists,
      askConfirm: async (message) => {
        confirmationMessage = message
        return false
      },
      createReader: () => assert.fail("decline must happen before reader construction"),
      createInstaller: () => assert.fail("decline must happen before installer construction"),
      convertAndInstallSkin: async () => assert.fail("decline must happen before conversion"),
      warn: () => assert.fail("decline must not emit conversion diagnostics"),
    })

    assert.equal(confirmationMessage, `${fixture.skinName} already exists. Overwrite it?`)
    assert.equal(await readFile(markerPath, "utf8"), "keep me")
    assert.equal(
      await pathExists(path.join(fixture.etternaRoot, "Save", "LocalProfiles", "00000004")),
      false,
    )
    assert.equal(await readFile(fixture.assetsConfigPath, "utf8"), originalAssetsConfig)
    assert.equal(await pathExists(path.join(fixture.etternaRoot, "Assets", "Judgments")), false)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("an authorized overwrite replaces only the selected NoteSkin and creates its profile", async () => {
  const fixture = await createFixture()
  const noteSkinsRoot = path.join(fixture.etternaRoot, "NoteSkins", "dance")
  const selectedNoteSkin = path.join(noteSkinsRoot, fixture.skinName)
  const unrelatedNoteSkin = path.join(noteSkinsRoot, "Unrelated NoteSkin")
  const oldSelectedMarker = path.join(selectedNoteSkin, "old-selected.bin")
  let reader: SkinReader | undefined
  let installer: SkinInstaller | undefined
  let confirmationMessage: string | undefined
  try {
    await mkdir(path.join(unrelatedNoteSkin, "nested"), { recursive: true })
    await mkdir(selectedNoteSkin, { recursive: true })
    await writeFile(oldSelectedMarker, Buffer.from([1, 3, 5, 7]))
    await writeFile(path.join(unrelatedNoteSkin, "keep.bin"), Buffer.from([2, 4, 6, 8]))
    await writeFile(path.join(unrelatedNoteSkin, "nested", "keep.txt"), "unchanged")
    const unrelatedBefore = await directorySnapshot(unrelatedNoteSkin)
    const configurations = await listOsuUserConfigurations(fixture.osuRoot)
    const references = await new OsuSkinCatalog().listSkins(fixture.osuRoot)

    await runOsuToEtternaRoute({
      localAppData: fixture.root,
      resolveDefaultOsuInstallationDirectory: () => fixture.osuRoot,
      etternaDefaultLocation: fixture.etternaRoot,
      resolveInstallationDirectory: async (defaultDirectory) => defaultDirectory,
      listOsuUserConfigurations: async () => configurations,
      selectOsuUserConfiguration: async (options) =>
        selectOsuUserConfiguration(options, async () => assert.fail("single CFG must not prompt")),
      listSkins: async () => references,
      selectSkin: async () => references[0]?.sourcePath,
      readEtternaTheme,
      resolveEtternaNoteSkinPath,
      noteSkinExists: pathExists,
      askConfirm: async (message) => {
        confirmationMessage = message
        return true
      },
      createReader: (configuration) => {
        reader = new OsuSkinReader({
          useDoubleResolutionAssets: configuration.useDoubleResolutionAssets,
          scrollSpeed: configuration.maniaSpeed,
        })
        return reader
      },
      createInstaller: (configuration) => {
        installer = createFixtureInstaller(configuration)
        return installer
      },
      convertAndInstallSkin: async (request) => {
        assert.ok(reader)
        assert.ok(installer)
        return convertAndInstallSkin(request, {
          readers: new Map([["osu", reader]]),
          installers: new Map([["etterna", installer]]),
          conversions: new ConversionRegistry([new OsuToEtternaConversion()]),
        })
      },
      warn: (message) => assert.fail(`unexpected diagnostic: ${message}`),
    })

    assert.equal(confirmationMessage, `${fixture.skinName} already exists. Overwrite it?`)
    assert.equal(await pathExists(oldSelectedMarker), false)
    await access(path.join(selectedNoteSkin, "NoteSkin.lua"))
    await access(path.join(selectedNoteSkin, "Receptors", "release Left (res 64x69).png"))
    assert.equal(await pathExists(path.join(noteSkinsRoot, "Fixture")), false)
    assert.deepEqual(await directorySnapshot(unrelatedNoteSkin), unrelatedBefore)

    const profileDirectory = path.join(fixture.etternaRoot, "Save", "LocalProfiles", "00000004")
    assert.match(await readFile(path.join(profileDirectory, "Editable.ini"), "utf8"), /Alice/)
    assert.match(
      await readFile(path.join(profileDirectory, "Etterna.xml"), "utf8"),
      new RegExp(`<Guid>${generatedGuid}</Guid>`),
    )
    await access(path.join(profileDirectory, "Type.ini"))
    await access(path.join(profileDirectory, "Rebirth_settings", "playerConfig.lua"))
    await access(
      path.join(
        fixture.etternaRoot,
        "Assets",
        "Judgments",
        `${fixture.skinName} - ${generatedGuid} 1x6 (Doubleres).png`,
      ),
    )
    assert.match(
      await readFile(fixture.assetsConfigPath, "utf8"),
      new RegExp(`\\["${generatedGuid}"\\].*${escapeRegExp(generatedGuid)} 1x6`),
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("restores an overwritten NoteSkin when profile promotion fails", async () => {
  const fixture = await createFixture()
  const noteSkinsRoot = path.join(fixture.etternaRoot, "NoteSkins", "dance")
  const noteSkinDirectory = path.join(noteSkinsRoot, fixture.skinName)
  const profilesRoot = path.join(fixture.etternaRoot, "Save", "LocalProfiles")
  const profileDirectory = path.join(profilesRoot, "00000004")
  const markerPath = path.join(noteSkinDirectory, "existing.txt")
  let injectedFailure = false
  try {
    await mkdir(noteSkinDirectory, { recursive: true })
    await writeFile(markerPath, "old NoteSkin")
    const fileSystem: Partial<TransactionalOutputSetFileSystem> = {
      rename: async (source, destination) => {
        if (!injectedFailure && path.dirname(destination) === profileDirectory) {
          injectedFailure = true
          throw new Error("fixture profile promotion failure")
        }
        await rename(source, destination)
      },
    }

    await assert.rejects(
      () => convertFixture(fixture, new TransactionalOutputSetPublisher(fileSystem), true),
      (error) =>
        error instanceof Error &&
        error.cause instanceof Error &&
        error.cause.message === "fixture profile promotion failure",
    )

    assert.equal(injectedFailure, true)
    assert.equal(await readFile(markerPath, "utf8"), "old NoteSkin")
    assert.deepEqual(await readdir(noteSkinDirectory), ["existing.txt"])
    assert.equal(await pathExists(profileDirectory), false)
    assert.equal(await readFile(fixture.assetsConfigPath, "utf8"), originalAssetsConfig)
    assert.equal(await pathExists(path.join(fixture.etternaRoot, "Assets", "Judgments")), false)
    assert.deepEqual((await readdir(noteSkinsRoot)).filter(isTransactionArtifact), [])
    assert.deepEqual((await readdir(profilesRoot)).filter(isTransactionArtifact), [])
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

interface Fixture {
  readonly root: string
  readonly osuRoot: string
  readonly etternaRoot: string
  readonly skinName: string
  readonly skinDirectory: string
  readonly receptors: Readonly<
    Record<ColumnDirection, { readonly normal: string; readonly pressed: string }>
  >
  readonly notes: Readonly<Record<ColumnDirection, string>>
  readonly assetsConfigPath: string
}

async function createFixture({
  upsideDown = 0,
  customJudgements = "all",
  defaultManiaAssetDensity,
  useMissingExplicitNoteReference = false,
}: {
  readonly upsideDown?: 0 | 1
  readonly customJudgements?:
    | "all"
    | "none"
    | readonly (typeof judgementFixtures)[number]["grade"][]
  readonly defaultManiaAssetDensity?: "standard" | "double"
  readonly useMissingExplicitNoteReference?: boolean
} = {}): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-to-etterna-"))
  const osuRoot = path.join(root, "osu!")
  const etternaRoot = path.join(root, "Etterna")
  const skinName = "General Name"
  const skinDirectory = path.join(osuRoot, "Skins", "Fixture")
  const assetsDirectory = path.join(skinDirectory, "assets")
  const profileDirectory = path.join(etternaRoot, "Save", "LocalProfiles", "00000003")
  const assetsConfigPath = path.join(etternaRoot, "Save", "Rebirth_settings", "assetsConfig.lua")
  const receptors = {} as Record<
    ColumnDirection,
    { readonly normal: string; readonly pressed: string }
  >
  const notes = {} as Record<ColumnDirection, string>

  await mkdir(assetsDirectory, { recursive: true })
  await mkdir(profileDirectory, { recursive: true })
  await mkdir(path.dirname(assetsConfigPath), { recursive: true })
  await writeFile(
    path.join(osuRoot, "osu!.Alice.cfg"),
    defaultManiaAssetDensity === "standard"
      ? "Username = Alice\nFullscreen = 1\nWidthFullscreen = 1280\nHeightFullscreen = 720\nManiaSpeed = 29\n"
      : "Username = Alice\nFullscreen = 1\nWidthFullscreen = 1920\nHeightFullscreen = 1080\nManiaSpeed = 29\n",
  )
  await writeFile(assetsConfigPath, originalAssetsConfig)
  await writeFile(
    path.join(skinDirectory, "skin.ini"),
    skinIni(
      skinName,
      upsideDown,
      defaultManiaAssetDensity
        ? useMissingExplicitNoteReference
          ? "missing-note"
          : "none"
        : "all",
    ),
  )
  await writeFile(path.join(etternaRoot, "Save", "Preferences.ini"), "[Options]\nTheme=Rebirth\n")
  await writeFile(
    path.join(profileDirectory, "Etterna.xml"),
    `<Stats><GeneralData><Guid>${existingGuid}</Guid></GeneralData></Stats>`,
  )

  for (const [directionIndex, direction] of directions.entries()) {
    const width = 12 + directionIndex
    const normal = path.join(assetsDirectory, `${direction}-release@2x.png`)
    const pressed = path.join(assetsDirectory, `${direction}-pressed@2x.png`)
    const note = path.join(assetsDirectory, `${direction}-note@2x.png`)
    await writeReceptor(normal, width, receptorColors[direction].normal)
    await writeReceptor(pressed, width, receptorColors[direction].pressed)
    await writeNote(note, 8 + directionIndex, 6 + directionIndex, directionIndex)
    receptors[direction] = { normal, pressed }
    notes[direction] = note
  }

  if (defaultManiaAssetDensity) {
    const densitySuffix = defaultManiaAssetDensity === "double" ? "@2x" : ""
    for (const [number, assetGroup] of [
      [1, "edge"],
      [2, "middle"],
    ] as const) {
      const normal = defaultReceptorColors[assetGroup].normal
      const pressed = defaultReceptorColors[assetGroup].pressed
      const note = defaultNoteColors[assetGroup]
      await writeSolidPng(
        path.join(skinDirectory, `mania-key${number}${densitySuffix}.png`),
        12,
        12,
        [normal.r, normal.g, normal.b, 255],
      )
      await writeSolidPng(
        path.join(skinDirectory, `mania-key${number}D${densitySuffix}.png`),
        12,
        12,
        [pressed.r, pressed.g, pressed.b, 255],
      )
      await writeSolidPng(
        path.join(skinDirectory, `mania-note${number}${densitySuffix}.png`),
        12,
        12,
        [note.r, note.g, note.b, 255],
      )
    }
  }

  for (const [index, fixture] of judgementFixtures.entries()) {
    if (
      customJudgements === "none" ||
      (customJudgements !== "all" && !customJudgements.includes(fixture.grade))
    ) {
      continue
    }
    await writeSolidPng(path.join(assetsDirectory, `${fixture.grade}.png`), 2, 2, [
      index,
      index,
      index,
      255,
    ])
    const relativeDoubleResolutionPath = judgementDoubleResolutionPath(fixture.grade)
    const doubleResolutionPath = path.join(skinDirectory, relativeDoubleResolutionPath)
    await writeSolidPng(doubleResolutionPath.replace(/-0@2x\.png$/, "@2x.png"), 2, 2, [
      index,
      index,
      index,
      255,
    ])
    await writeSolidPng(doubleResolutionPath, fixture.width, fixture.height, fixture.color)
  }

  for (let digit = 0; digit <= 9; digit += 1) {
    await writeSolidPng(
      path.join(assetsDirectory, `combo-${digit}@2x.png`),
      29,
      42,
      [255, 255, 255, 255],
    )
  }

  return {
    root,
    osuRoot,
    etternaRoot,
    skinName,
    skinDirectory,
    receptors,
    notes,
    assetsConfigPath,
  }
}

async function convertFixture(
  fixture: Fixture,
  publisher = new TransactionalOutputSetPublisher(),
  overwriteExistingNoteSkin = false,
) {
  const configurations = await listOsuUserConfigurations(fixture.osuRoot)
  const configuration = requiredConfiguration(configurations[0])
  const references = await new OsuSkinCatalog().listSkins(fixture.osuRoot)
  const reference = requiredReference(references[0])
  const theme = await readEtternaTheme(fixture.etternaRoot)
  const installer = createFixtureInstaller(
    {
      gameRoot: fixture.etternaRoot,
      profileName: configuration.username,
      theme,
      expectedNoteSkinName: reference.name,
      overwriteExistingNoteSkin,
    },
    publisher,
  )

  return convertAndInstallSkin(
    { reference, targetGame: "etterna" },
    {
      readers: new Map([
        [
          "osu",
          new OsuSkinReader({
            useDoubleResolutionAssets: configuration.useDoubleResolutionAssets,
            scrollSpeed: configuration.maniaSpeed,
          }),
        ],
      ]),
      installers: new Map([["etterna", installer]]),
      conversions: new ConversionRegistry([new OsuToEtternaConversion()]),
    },
  )
}

function createFixtureInstaller(
  configuration: EtternaSkinInstallerConfiguration,
  publisher = new TransactionalOutputSetPublisher(),
): EtternaSkinInstaller {
  const generatedValues = [Buffer.from(existingGuid, "hex"), Buffer.from(generatedGuid, "hex")]
  return new EtternaSkinInstaller(configuration, {
    allocateProfileIdentity: (gameRoot) =>
      allocateEtternaProfileIdentity(gameRoot, {
        randomBytes: () => generatedValues.shift() ?? Buffer.alloc(8),
      }),
    noteSkinWriter: new EtternaNoteSkinWriter(path.join(etternaTemplatesPath, "noteskin")),
    profileWriter: new EtternaProfileWriter(path.join(etternaTemplatesPath, "profile")),
    judgementWriter: new EtternaJudgementWriter(
      path.join(etternaTemplatesPath, "judgement", "osu!mania-default 1x6.png"),
    ),
    assetsConfigWriter: {
      prepareUpdate: prepareEtternaAssetsConfigUpdate,
      writeUpdate: writeEtternaAssetsConfigUpdate,
    },
    publisher,
  })
}

function skinIni(
  name: string,
  upsideDown: 0 | 1,
  maniaAssetReferences: "all" | "none" | "missing-note" = "all",
): string {
  const entries =
    maniaAssetReferences === "all"
      ? directions.flatMap((direction, index) => [
          `KeyImage${index}: ASSETS\\${direction}-release`,
          `KeyImage${index}D: Assets\\${direction}-pressed`,
          `NoteImage${index}: assets\\${direction}-note`,
        ])
      : maniaAssetReferences === "missing-note"
        ? ["NoteImage0: missing-note"]
        : []
  return [
    "[General]",
    `Name: ${name}`,
    "[Fonts]",
    "ComboPrefix: assets\\combo",
    "[Mania]",
    "Keys: 1",
    "[Mania]",
    "Keys: 2",
    "[Mania]",
    "Keys: 3",
    "[Mania]",
    "Keys: 4",
    `UpsideDown: ${upsideDown}`,
    "HitPosition: 436",
    "ComboPosition: 250",
    "ScorePosition: 280",
    "ColumnWidth: 68,68,68,68",
    "Hit300: perfect",
    "Hit200: assets",
    "Hit100: assets\\good",
    "Hit50: assets\\bad",
    "Hit0: assets\\miss",
    ...entries,
    "",
  ].join("\n")
}

function judgementDoubleResolutionPath(grade: (typeof judgementFixtures)[number]["grade"]): string {
  switch (grade) {
    case "marvelous":
      return "mania-hit300g-0@2x.png"
    case "perfect":
      return "perfect-0@2x.png"
    case "great":
      return path.join("assets", "mania-hit200-0@2x.png")
    default:
      return path.join("assets", `${grade}@2x.png`)
  }
}

async function writeSolidPng(
  filePath: string,
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: color[0], g: color[1], b: color[2], alpha: color[3] / 255 },
    },
  })
    .png()
    .toFile(filePath)
}

async function writeReceptor(
  filePath: string,
  width: number,
  color: { readonly r: number; readonly g: number; readonly b: number },
): Promise<void> {
  const height = width + 8
  const data = Buffer.alloc(width * height * 4)
  for (let y = 3; y < height - 4; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const offset = (y * width + x) * 4
      data[offset] = color.r
      data[offset + 1] = color.g
      data[offset + 2] = color.b
      data[offset + 3] = 255
    }
  }
  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(filePath)
}

async function writeNote(
  filePath: string,
  width: number,
  height: number,
  index: number,
): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 40 * index, g: 80 + 20 * index, b: 200, alpha: 1 },
    },
  })
    .png()
    .toFile(filePath)
}

async function assertStaticNoteSkinTemplate(noteSkinDirectory: string): Promise<void> {
  for (const relativePath of [
    "NoteSkin.lua",
    "metrics.ini",
    path.join("Holds", "Up Hold Body Active (doubleres).png"),
    path.join("Misc", "Lift.png"),
  ]) {
    await access(path.join(noteSkinDirectory, relativePath))
  }
}

function rgbaAt(data: Buffer, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4
  return [...data.subarray(offset, offset + 4)]
}

async function assertJudgementSheet(filePath: string): Promise<void> {
  const output = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const cellWidth = Math.max(...judgementFixtures.map((fixture) => fixture.width))
  const cellHeight = Math.max(...judgementFixtures.map((fixture) => fixture.height))
  assert.deepEqual(
    { width: output.info.width, height: output.info.height },
    { width: cellWidth, height: cellHeight * judgementFixtures.length },
  )

  for (const [row, fixture] of judgementFixtures.entries()) {
    const left = Math.floor((cellWidth - fixture.width) / 2)
    const top = Math.floor((cellHeight - fixture.height) / 2)
    for (let y = 0; y < cellHeight; y += 1) {
      for (let x = 0; x < cellWidth; x += 1) {
        const inside = x >= left && x < left + fixture.width && y >= top && y < top + fixture.height
        assert.deepEqual(
          rgbaAt(output.data, output.info.width, x, row * cellHeight + y),
          inside ? [...fixture.color] : [0, 0, 0, 0],
          `${fixture.grade} (${x}, ${y})`,
        )
      }
    }
  }
}

async function assertFallbackJudgementSheet(
  filePath: string,
  customGrades: ReadonlySet<(typeof judgementFixtures)[number]["grade"]>,
): Promise<void> {
  const defaultPath = path.join(etternaTemplatesPath, "judgement", "osu!mania-default 1x6.png")
  const defaultMetadata = await sharp(defaultPath).metadata()
  assert.ok(defaultMetadata.width)
  assert.ok(defaultMetadata.height)
  assert.equal(defaultMetadata.height % judgementFixtures.length, 0)
  const sourceCellHeight = defaultMetadata.height / judgementFixtures.length
  const expectedWidth = defaultMetadata.width * 2
  const expectedCellHeight = sourceCellHeight * 2
  const output = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.deepEqual(
    { width: output.info.width, height: output.info.height },
    { width: expectedWidth, height: expectedCellHeight * judgementFixtures.length },
  )

  for (const [row, fixture] of judgementFixtures.entries()) {
    const actualRow = output.data.subarray(
      row * expectedCellHeight * expectedWidth * 4,
      (row + 1) * expectedCellHeight * expectedWidth * 4,
    )
    if (customGrades.has(fixture.grade)) {
      assert.deepEqual(
        rgbaAt(
          actualRow,
          expectedWidth,
          Math.floor(expectedWidth / 2),
          Math.floor(expectedCellHeight / 2),
        ),
        [...fixture.color],
      )
      continue
    }

    const expectedRow = await sharp(defaultPath)
      .extract({
        left: 0,
        top: row * sourceCellHeight,
        width: defaultMetadata.width,
        height: sourceCellHeight,
      })
      .resize(expectedWidth, expectedCellHeight)
      .ensureAlpha()
      .raw()
      .toBuffer()
    assertBuffersNear(actualRow, expectedRow, fixture.grade)
  }
}

function assertBuffersNear(actual: Buffer, expected: Buffer, label: string): void {
  assert.equal(actual.length, expected.length, label)
  let maximumChannelDifference = 0
  for (let index = 0; index < actual.length; index += 1) {
    maximumChannelDifference = Math.max(
      maximumChannelDifference,
      Math.abs((actual[index] ?? 0) - (expected[index] ?? 0)),
    )
  }
  assert.ok(
    maximumChannelDifference <= 1,
    `${label} differs from the doubled default by ${maximumChannelDifference} channel levels`,
  )
}

async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const candidate = path.join(directory, entry.name)
      return entry.isDirectory() ? listFilesRecursively(candidate) : [candidate]
    }),
  )
  return paths.flat()
}

async function directorySnapshot(directory: string): Promise<Readonly<Record<string, string>>> {
  const files = await listFilesRecursively(directory)
  const entries = await Promise.all(
    files.map(
      async (filePath) =>
        [path.relative(directory, filePath), (await readFile(filePath)).toString("hex")] as const,
    ),
  )
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)))
}

function isTransactionArtifact(entry: string): boolean {
  return entry.includes(".staging-") || entry.includes(".backup-")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch (cause) {
    if (isNotFoundError(cause)) return false
    throw cause
  }
}

function isNotFoundError(cause: unknown): cause is NodeJS.ErrnoException {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"
}

function requiredConfiguration(
  configuration: OsuUserConfiguration | undefined,
): OsuUserConfiguration {
  assert.ok(configuration)
  return configuration
}

function requiredReference(reference: SkinReference | undefined): SkinReference {
  assert.ok(reference)
  return reference
}
