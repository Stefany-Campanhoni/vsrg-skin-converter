import { expect, test } from "bun:test"
import { createMapSourceFiles } from "../../../../tests/support/map-source-files.ts"
import { createEtternaSourceFixture } from "../../../../tests/support/migration-source-fixtures.ts"
import { discoverEtternaSource } from "./discover-etterna-source.ts"

test("Etterna discovery lists skins/profiles without reading Songs or unrelated profile bytes", async () => {
  const source = createMapSourceFiles(await createEtternaSourceFixture())
  const paths: string[] = []
  const result = await discoverEtternaSource({
    ...source,
    list: async (path) => {
      paths.push(path)
      return source.list(path)
    },
  })
  expect(result.skins).toEqual([{ name: "Reference", path: "NoteSkins/dance/Reference" }])
  expect(result.profileIds).toEqual(["00000000"])
  expect(result.theme).toBe("Rebirth")
  expect(paths.some((path) => path.startsWith("Songs"))).toBe(false)
})
test("missing preferences use Rebirth defaults while present invalid preferences fail", async () => {
  const files = new Map(await createEtternaSourceFixture())
  files.delete("Save/Preferences.ini")
  expect((await discoverEtternaSource(createMapSourceFiles(files))).diagnostics[0]?.code).toBe(
    "web.etterna.default-theme",
  )
  files.set("Save/Preferences.ini", new TextEncoder().encode("[Options]\nBroken=1"))
  await expect(discoverEtternaSource(createMapSourceFiles(files))).rejects.toThrow(
    /theme is not configured/,
  )
})
