import { expect, test } from "bun:test"
import { readEtternaVisualSkinFromSource } from "../../src/adapters/etterna/reader/read-etterna-visual-skin-from-source.ts"
import { readOsuVisualSkinFromSource } from "../../src/adapters/osu/reader/read-osu-visual-skin-from-source.ts"
import { createRegisteredAssetLoader } from "../../src/infrastructure/filesystem/registered-asset-loader.ts"
import { createImageOperations } from "../../src/infrastructure/image/shared-image-operations.ts"
import { createSharpImageBackend } from "../../src/infrastructure/image/sharp-image-backend.ts"
import { createMapSourceFiles } from "../support/map-source-files.ts"
import {
  createEtternaSourceFixture,
  createOsuSourceFixture,
} from "../support/migration-source-fixtures.ts"

function ports(files: ReadonlyMap<string, Uint8Array>) {
  const source = createMapSourceFiles(files),
    loader = createRegisteredAssetLoader()
  loader.register(source)
  return { source, images: createImageOperations(loader, createSharpImageBackend()) }
}
test("browser Etterna assets reject case-ambiguous physical files", async () => {
  const files = new Map(await createEtternaSourceFixture())
  const original = "NoteSkins/dance/Reference/Notes/_Left Tap Note.png"
  const bytes = files.get(original)
  if (!bytes) throw new Error("Missing source fixture")
  files.set("NoteSkins/dance/Reference/Notes/_LEFT TAP NOTE.PNG", bytes)
  const { source, images } = ports(files)
  await expect(
    readEtternaVisualSkinFromSource(source, images, {
      skinPath: "NoteSkins/dance/Reference",
      name: "Reference",
      theme: "Rebirth",
      useDefaultSettings: true,
    }),
  ).rejects.toThrow(/ambiguous/)
})
test("folder-only osu reader imports visual settings and assets without reading a CFG", async () => {
  const { source, images } = ports(await createOsuSourceFixture())
  const skin = await readOsuVisualSkinFromSource(source, images, {
    name: "Reference",
    useDoubleResolutionAssets: false,
  })
  expect(skin.playfield).toStrictEqual({
    hitPosition: 432,
    judgementPosition: 244,
    comboPosition: 209,
    columnWidth: 68,
    comboScale: 1,
    judgementScale: 1,
    isDownscroll: true,
  })
  expect(skin.assets.receptors?.right.pressed.filePath).toMatch(/pressed-right.png$/)
  expect(skin.assets.tapNotes?.down.filePath).toMatch(/note-down.png$/)
})
test("installation reader imports Etterna configuration through the unchanged parser", async () => {
  const { source, images } = ports(await createEtternaSourceFixture())
  const result = await readEtternaVisualSkinFromSource(source, images, {
    skinPath: "NoteSkins/dance/Reference",
    name: "Reference",
    profileId: "00000000",
    theme: "Rebirth",
    useDefaultSettings: false,
  })
  expect(result.skin.playfield).toStrictEqual({
    hitPosition: -6,
    judgementPosition: 4,
    comboPosition: -20,
    columnWidth: 108,
    comboScale: 0.6,
    judgementScale: 0.675,
  })
  expect(result.scrollSpeed).toBe(888)
  expect(result.skin.assets.judgements?.images.great?.frame).toEqual({
    index: 2,
    columns: 1,
    rows: 6,
  })
})
test("missing Etterna settings use browser defaults but malformed Lua stays fatal", async () => {
  const files = new Map(await createEtternaSourceFixture())
  const settings = "Save/LocalProfiles/00000000/Rebirth_settings/playerConfig.lua"
  files.delete(settings)
  const { source, images } = ports(files)
  const result = await readEtternaVisualSkinFromSource(source, images, {
    skinPath: "NoteSkins/dance/Reference",
    name: "Reference",
    profileId: "00000000",
    theme: "Rebirth",
    useDefaultSettings: false,
  })
  expect(result.skin.playfield.columnWidth).toBe(100)
  expect(result.skin.diagnostics.some((d) => d.code === "web.etterna.default-settings")).toBe(true)
  files.set(settings, new TextEncoder().encode("return { broken syntax"))
  const malformed = ports(files)
  await expect(
    readEtternaVisualSkinFromSource(malformed.source, malformed.images, {
      skinPath: "NoteSkins/dance/Reference",
      name: "Reference",
      profileId: "00000000",
      theme: "Rebirth",
      useDefaultSettings: false,
    }),
  ).rejects.toThrow()
  await expect(
    readEtternaVisualSkinFromSource(malformed.source, malformed.images, {
      skinPath: "NoteSkins/dance/Reference",
      name: "Reference",
      profileId: "00000000",
      theme: "Rebirth",
      useDefaultSettings: true,
    }),
  ).rejects.toThrow()
})
test("a valid Etterna profile without CMod uses visual migration, while invalid CMod remains fatal", async () => {
  const files = new Map(await createEtternaSourceFixture())
  const xmlPath = "Save/LocalProfiles/00000000/Etterna.xml"
  files.set(
    xmlPath,
    new TextEncoder().encode(
      "<Stats><Guid>fixtureguid</Guid><DefaultModifiers><dance>M100</dance></DefaultModifiers></Stats>",
    ),
  )
  let p = ports(files)
  const options = {
    skinPath: "NoteSkins/dance/Reference",
    name: "Reference",
    profileId: "00000000",
    theme: "Rebirth",
    useDefaultSettings: false,
  }
  expect(
    (await readEtternaVisualSkinFromSource(p.source, p.images, options)).scrollSpeed,
  ).toBeUndefined()
  files.set(
    xmlPath,
    new TextEncoder().encode(
      "<Stats><Guid>fixtureguid</Guid><DefaultModifiers><dance>C-5</dance></DefaultModifiers></Stats>",
    ),
  )
  p = ports(files)
  await expect(readEtternaVisualSkinFromSource(p.source, p.images, options)).rejects.toThrow(
    /positive integer/,
  )
})
test("explicit HD image references never fall back to an available standard image", async () => {
  const files = new Map(await createOsuSourceFixture())
  const ini = files.get("skin.ini")
  files.set(
    "skin.ini",
    new TextEncoder().encode(
      new TextDecoder().decode(ini).replace("NoteImage0: note-left", "NoteImage0: note-left@2x"),
    ),
  )
  const { source, images } = ports(files)
  await expect(
    readOsuVisualSkinFromSource(source, images, {
      name: "Reference",
      useDoubleResolutionAssets: false,
    }),
  ).rejects.toThrow(/tapNotes.left/)
})
