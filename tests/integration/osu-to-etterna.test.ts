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
          `${prefix} ${title} (res 64x64).png`,
        )
        const output = await sharp(outputPath)
          .raw()
          .ensureAlpha()
          .toBuffer({ resolveWithObject: true })

        assert.deepEqual(
          { width: output.info.width, height: output.info.height },
          { width: 146, height: 146 },
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

      const noteOutput = path.join(noteSkinDirectory, "Notes", `_${title} Tap Note (res 64x64).png`)
      const output = await sharp(noteOutput)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
      assert.deepEqual(
        { width: output.info.width, height: output.info.height },
        { width: 150, height: 150 },
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
      "pressed Down (res 64x64).png",
      "pressed Left (res 64x64).png",
      "pressed Right (res 64x64).png",
      "pressed Up (res 64x64).png",
      "release Down (res 64x64).png",
      "release Left (res 64x64).png",
      "release Right (res 64x64).png",
      "release Up (res 64x64).png",
    ])
    assert.deepEqual((await readdir(path.join(noteSkinDirectory, "Notes"))).sort(), [
      "_Down Tap Note (res 64x64).png",
      "_Left Tap Note (res 64x64).png",
      "_Right Tap Note (res 64x64).png",
      "_Up Tap Note (res 64x64).png",
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
    const guid = /<Guid>([^<]+)<\/Guid>/.exec(xml)?.[1]
    assert.match(guid ?? "", /^[0-9a-f]{16}$/)
    assert.notEqual(guid, existingGuid)
    assert.match(playerConfig, /NoteFieldY= -2(?:,|\s)/)
    assert.match(playerConfig, /ComboY= 21(?:,|\s)/)
    assert.match(playerConfig, /JudgmentY= 40(?:,|\s)/)
    assert.match(playerConfig, /ReceptorSize= 106(?:,|\s)/)
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
    await access(path.join(selectedNoteSkin, "Receptors", "release Left (res 64x64).png"))
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

async function createFixture(): Promise<Fixture> {
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
    "Username = Alice\nFullscreen = 1\nWidthFullscreen = 1920\nHeightFullscreen = 1080\n",
  )
  await writeFile(assetsConfigPath, originalAssetsConfig)
  await writeFile(path.join(skinDirectory, "skin.ini"), skinIni(skinName))
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

  for (const [index, fixture] of judgementFixtures.entries()) {
    await writeSolidPng(path.join(assetsDirectory, `${fixture.grade}.png`), 2, 2, [
      index,
      index,
      index,
      255,
    ])
    await writeSolidPng(
      path.join(assetsDirectory, `${fixture.grade}@2x.png`),
      fixture.width,
      fixture.height,
      fixture.color,
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
    judgementWriter: new EtternaJudgementWriter(),
    assetsConfigWriter: {
      prepareUpdate: prepareEtternaAssetsConfigUpdate,
      writeUpdate: writeEtternaAssetsConfigUpdate,
    },
    publisher,
  })
}

function skinIni(name: string): string {
  const entries = directions.flatMap((direction, index) => [
    `KeyImage${index}: ASSETS\\${direction}-release`,
    `KeyImage${index}D: Assets\\${direction}-pressed`,
    `NoteImage${index}: assets\\${direction}-note`,
  ])
  return [
    "[General]",
    `Name: ${name}`,
    "[Mania]",
    "Keys: 1",
    "[Mania]",
    "Keys: 2",
    "[Mania]",
    "Keys: 3",
    "[Mania]",
    "Keys: 4",
    "HitPosition: 436",
    "ComboPosition: 250",
    "ScorePosition: 280",
    "ColumnWidth: 68,68,68,68",
    "Hit300g: assets\\marvelous",
    "Hit300: assets\\perfect",
    "Hit200: assets\\great",
    "Hit100: assets\\good",
    "Hit50: assets\\bad",
    "Hit0: assets\\miss",
    ...entries,
    "",
  ].join("\n")
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
