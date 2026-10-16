import { expect, test } from "bun:test"
import { unzipSync } from "fflate"
import sharp from "sharp"
import { createNativeSourceFiles } from "../../src/infrastructure/filesystem/native-source-files.ts"
import { createSharpImageBackend } from "../../src/infrastructure/image/sharp-image-backend.ts"
import { createWebConversionRuntime } from "../../src/web/web-conversion.ts"
import type { BrowserSource, ConversionProgress } from "../../src/web/worker-messages.ts"
import {
  createEtternaSourceFixture,
  createOsuSourceFixture,
} from "../support/migration-source-fixtures.ts"

function source(files: ReadonlyMap<string, Uint8Array>): BrowserSource {
  return {
    kind: "file-list",
    files: [...files].map(([path, bytes]) => {
      const file = new File([new Uint8Array(bytes)], path.split("/").at(-1) ?? path)
      Object.defineProperty(file, "webkitRelativePath", { value: `Fixture/${path}` })
      return file
    }),
  }
}
for (const direction of ["osu-to-etterna", "etterna-to-osu"] as const)
  test(`web ${direction} produces a complete archive through shared operations`, async () => {
    const runtime = createWebConversionRuntime({
      backend: createSharpImageBackend(),
      loadTemplates: async (game) =>
        createNativeSourceFiles(`${import.meta.dir}/../../src/templates/${game}`),
    })
    const progress: ConversionProgress[] = []
    const input = source(
      await (direction === "osu-to-etterna"
        ? createOsuSourceFixture()
        : createEtternaSourceFixture()),
    )
    const request =
      direction === "osu-to-etterna"
        ? { direction, source: input, skinName: "Reference", useDoubleResolutionAssets: false }
        : {
            direction,
            source: input,
            skinPath: "NoteSkins/dance/Reference",
            profileId: "00000000",
            theme: "Rebirth",
            useDefaultSettings: false,
          }
    const preview = await runtime.inspect(request)
    expect(preview).toHaveProperty("artwork")
    expect(preview.artwork.map((lane) => lane.direction)).toEqual(["left", "down", "up", "right"])
    for (const [index, lane] of preview.artwork.entries())
      for (const image of [lane.note, lane.receptor]) {
        const { data, info } = await sharp(image)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        expect(info.width).toBeGreaterThan(0)
        expect(info.height).toBeGreaterThan(0)
        expect([...data.slice(0, 4)]).toEqual([index * 40, 90, 200, 255])
      }
    const result = await runtime.run(request, (step) => progress.push(step))
    const files = unzipSync(result.archive)
    expect(progress.at(-1)).toEqual({ phase: "archiving", completed: 1, total: 1 })
    if (direction === "osu-to-etterna") {
      expect(result.convertedManiaSpeed).toBeUndefined()
      expect(
        Object.keys(files).some((path) => path.endsWith("Etterna.xml") || path.endsWith(".cfg")),
      ).toBe(false)
      expect(new TextDecoder().decode(files["profile-settings/playerConfig.lua"])).not.toMatch(
        /CMod|scrollSpeed/,
      )
    } else {
      expect(result.convertedManiaSpeed).toBe(29)
      expect(new TextDecoder().decode(files["INSTALLATION.md"])).toContain("ManiaSpeed = 29")
      expect(files["Reference/skin.ini"]).toBeDefined()
    }
    await runtime.dispose()
  })
