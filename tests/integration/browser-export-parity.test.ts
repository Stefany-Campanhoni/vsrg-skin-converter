import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { unzipSync } from "fflate"
import { readEtternaVisualSkinFromSource } from "../../src/adapters/etterna/reader/read-etterna-visual-skin-from-source.ts"
import { buildEtternaVisualFiles } from "../../src/adapters/etterna/writer/build-etterna-visual-files.ts"
import { EtternaNoteSkinWriter } from "../../src/adapters/etterna/writer/etterna-note-skin-writer.ts"
import { readOsuVisualSkinFromSource } from "../../src/adapters/osu/reader/read-osu-visual-skin-from-source.ts"
import { buildOsuSkinFiles } from "../../src/adapters/osu/writer/build-osu-skin-files.ts"
import { OsuSkinWriter } from "../../src/adapters/osu/writer/osu-skin-writer.ts"
import { EtternaToOsuVisualConversion } from "../../src/conversions/etterna-to-osu/etterna-to-osu-visual-conversion.ts"
import { OsuToEtternaVisualConversion } from "../../src/conversions/osu-to-etterna/osu-to-etterna-visual-conversion.ts"
import { createSkinArchive } from "../../src/infrastructure/archive/create-skin-archive.ts"
import { createGeneratedFileSet } from "../../src/infrastructure/archive/generated-file-set.ts"
import { createNativeSourceFiles } from "../../src/infrastructure/filesystem/native-source-files.ts"
import { createRegisteredAssetLoader } from "../../src/infrastructure/filesystem/registered-asset-loader.ts"
import { createImageOperations } from "../../src/infrastructure/image/shared-image-operations.ts"
import { createSharpImageBackend } from "../../src/infrastructure/image/sharp-image-backend.ts"
import { decodeReference } from "../support/image-reference.ts"
import {
  createEtternaSourceFixture,
  createOsuSourceFixture,
} from "../support/migration-source-fixtures.ts"

for (const direction of ["etterna-to-osu", "osu-to-etterna"] as const)
  test(`${direction} archive preserves native asset inventory and decoded pixels`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vsrg-browser-export-"))
    try {
      const sourceRoot = path.join(root, "source")
      for (const [relative, bytes] of await (direction === "etterna-to-osu"
        ? createEtternaSourceFixture()
        : createOsuSourceFixture()))
        await Bun.write(path.join(sourceRoot, relative), bytes)
      const source = createNativeSourceFiles(sourceRoot),
        templates = createNativeSourceFiles(
          path.resolve("src/templates", direction === "etterna-to-osu" ? "osu" : "etterna"),
        )
      const loader = createRegisteredAssetLoader()
      loader.register(source)
      loader.register(templates)
      const images = createImageOperations(loader, createSharpImageBackend()),
        output = createGeneratedFileSet(256 * 1024 * 1024)
      const skin =
        direction === "etterna-to-osu"
          ? await new EtternaToOsuVisualConversion().convert(
              (
                await readEtternaVisualSkinFromSource(source, images, {
                  skinPath: "NoteSkins/dance/Reference",
                  name: "Reference",
                  profileId: "00000000",
                  theme: "Rebirth",
                  useDefaultSettings: false,
                })
              ).skin,
            )
          : await new OsuToEtternaVisualConversion().convert(
              await readOsuVisualSkinFromSource(source, images, {
                name: "Reference",
                useDoubleResolutionAssets: false,
              }),
            )
      const native = path.join(root, "native")
      if (direction === "etterna-to-osu") {
        await buildOsuSkinFiles(skin, { templates, images, output })
        await new OsuSkinWriter(path.resolve("src/templates/osu")).writeSkin(
          { ...skin, playfield: { ...skin.playfield, scrollSpeed: 29 } },
          native,
        )
      } else {
        await buildEtternaVisualFiles(skin, { templates, images, output })
        await new EtternaNoteSkinWriter(path.resolve("src/templates/etterna/noteskin")).writeSkin(
          { ...skin, playfield: { ...skin.playfield, scrollSpeed: 902 } },
          native,
        )
      }
      const archive = unzipSync(await createSkinArchive(output.snapshot()))
      const prefix = direction === "etterna-to-osu" ? "Reference/" : "NoteSkins/dance/Reference/"
      const nativeFiles = (await readdir(native, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) =>
          path.relative(native, path.join(entry.parentPath, entry.name)).replace(/\\/g, "/"),
        )
        .sort()
      expect(
        Object.keys(archive)
          .filter((name) => name.startsWith(prefix))
          .map((name) => name.slice(prefix.length))
          .sort(),
      ).toEqual(nativeFiles)
      for (const file of nativeFiles) {
        const generated = archive[prefix + file]
        expect(generated).toBeDefined()
        if (!generated) throw new Error("Missing archive file")
        const original = new Uint8Array(await Bun.file(path.join(native, file)).arrayBuffer())
        if (file.endsWith(".png"))
          expect(await decodeReference(generated), file).toStrictEqual(
            await decodeReference(original),
          )
        else expect(generated, file).toEqual(original)
      }
      if (direction === "osu-to-etterna") {
        expect(Object.keys(archive).some((name) => name.endsWith("Etterna.xml"))).toBe(false)
        expect(new TextDecoder().decode(archive["profile-settings/playerConfig.lua"])).not.toMatch(
          /CMod|C902|scrollSpeed/,
        )
        expect(new TextDecoder().decode(archive["INSTALLATION.md"])).toContain(
          "https://cmodcalc.com/",
        )
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
