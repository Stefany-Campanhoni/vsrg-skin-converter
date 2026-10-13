import path from "node:path"
import { expect, test } from "@playwright/test"
import { unzipSync } from "fflate"
import { createNativeSourceFiles } from "../../src/infrastructure/filesystem/native-source-files.ts"
import { createSharpImageBackend } from "../../src/infrastructure/image/sharp-image-backend.ts"
import { createWebConversionRuntime } from "../../src/web/web-conversion.ts"
import { decodeReference } from "../support/image-reference.ts"
import {
  createEtternaSourceFixture,
  createOsuSourceFixture,
} from "../support/migration-source-fixtures.ts"

const root = path.resolve(".tmp/web-fixtures")
let before: Map<string, string>
const expectedArchives = new Map<string, Record<string, Uint8Array>>()
async function compareArchive(actual: Record<string, Uint8Array>, direction: string) {
  const expected = expectedArchives.get(direction)
  if (!expected) throw new Error("Missing native archive")
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort())
  for (const [name, bytes] of Object.entries(expected)) {
    const received = actual[name]
    expect(received, name).toBeDefined()
    if (!received) continue
    if (name.endsWith(".png")) {
      const a = await decodeReference(received),
        b = await decodeReference(bytes)
      expect({ width: a.width, height: a.height }, name).toEqual({
        width: b.width,
        height: b.height,
      })
      expect(a.pixels.length, name).toBe(b.pixels.length)
      expect(
        a.pixels.reduce((count, value, index) => count + Number(value !== b.pixels[index]), 0),
        name,
      ).toBe(0)
    } else expect(received, name).toEqual(bytes)
  }
}
test.beforeAll(async () => {
  before = new Map()
  for (const direction of ["etterna-to-osu", "osu-to-etterna"] as const) {
    const runtime = createWebConversionRuntime({
      backend: createSharpImageBackend(),
      loadTemplates: async (game) => createNativeSourceFiles(`src/templates/${game}`),
    })
    const fixture = await (direction === "etterna-to-osu"
      ? createEtternaSourceFixture()
      : createOsuSourceFixture())
    const source = {
      kind: "file-list" as const,
      files: [...fixture].map(([name, bytes]) => new File([new Uint8Array(bytes)], name)),
      relativePaths: [...fixture.keys()].map((name) => `Fixture/${name}`),
    }
    const result = await runtime.run(
      direction === "etterna-to-osu"
        ? {
            direction,
            source,
            skinPath: "NoteSkins/dance/Reference",
            profileId: "00000000",
            theme: "Rebirth",
            useDefaultSettings: false,
          }
        : { direction, source, skinName: "Osu", useDoubleResolutionAssets: false },
      () => {},
    )
    expectedArchives.set(direction, unzipSync(result.archive))
    await runtime.dispose()
  }
  for (const [name, fixture] of [
    ["Etterna", await createEtternaSourceFixture()],
    ["Osu", await createOsuSourceFixture()],
  ] as const)
    for (const [file, bytes] of fixture) {
      const target = path.join(root, name, file)
      await Bun.write(target, bytes)
      before.set(target, Bun.hash(bytes).toString())
    }
})
test("fresh Pages isolation, both complete downloads and private read-only folder input", async ({
  page,
}) => {
  const requests: string[] = []
  page.on("request", (request) => requests.push(request.url()))
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/")
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)
  await page.locator("#folder").setInputFiles(path.join(root, "Etterna"))
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await page.locator("#next").click()
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#values")).toContainText("29")
  await page.locator("#convert").click()
  await expect(page.locator("#download")).toBeVisible({ timeout: 30000 })
  const firstDownload = page.waitForEvent("download")
  await page.locator("#download").click()
  const forward = await firstDownload
  const forwardPath = await forward.path()
  expect(forwardPath).toBeTruthy()
  const forwardFiles = unzipSync(new Uint8Array(await Bun.file(forwardPath ?? "").arrayBuffer()))
  expect(forwardFiles["Reference/skin.ini"]).toBeDefined()
  await compareArchive(forwardFiles, "etterna-to-osu")
  expect(new TextDecoder().decode(forwardFiles["INSTALLATION.md"])).toContain("ManiaSpeed = 29")
  await page.locator("#reset").click()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await page.locator("#folder").setInputFiles(path.join(root, "Osu"))
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await page.locator("#next").click()
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#manual-speed a")).toHaveAttribute("href", "https://cmodcalc.com/")
  await page.locator("#convert").click()
  await expect(page.locator("#download")).toBeVisible({ timeout: 30000 })
  const secondDownload = page.waitForEvent("download")
  await page.locator("#download").click()
  const reverse = await secondDownload
  const reversePath = await reverse.path()
  const reverseFiles = unzipSync(new Uint8Array(await Bun.file(reversePath ?? "").arrayBuffer()))
  await compareArchive(reverseFiles, "osu-to-etterna")
  expect(
    Object.keys(reverseFiles).some((file) => file.endsWith("Etterna.xml") || file.endsWith(".cfg")),
  ).toBe(false)
  expect(new TextDecoder().decode(reverseFiles["profile-settings/playerConfig.lua"])).not.toMatch(
    /CMod|scrollSpeed/,
  )
  expect(Object.keys(reverseFiles).some((file) => file.startsWith("NoteSkins/dance/"))).toBe(true)
  expect(
    requests.every(
      (url) =>
        url.startsWith("http://127.0.0.1:4173/vsrg-skin-converter/") ||
        url.startsWith("blob:http://127.0.0.1:4173/"),
    ),
  ).toBe(true)
  expect(requests.some((url) => /LocalProfiles|Reference/.test(url))).toBe(false)
  for (const [file, hash] of before)
    expect(Bun.hash(new Uint8Array(await Bun.file(file).arrayBuffer())).toString()).toBe(hash)
  await page.screenshot({ path: ".tmp/browser-result.png", fullPage: true })
  await page.locator("#reset").click()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#download")).toBeHidden()
})
test("invalid source is actionable and never creates a download", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/")
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#select")).toBeEnabled()
  const invalid = path.join(root, "Invalid")
  await Bun.write(path.join(invalid, "skin.ini"), "[Mania]\nKeys=7\n")
  await page.locator("#folder").setInputFiles(invalid)
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await page.locator("#next").click()
  await expect(page.locator("#error")).toBeVisible({ timeout: 30000 })
  await expect(page.locator("#processing")).toBeHidden()
  await page.locator("#back").click()
  await expect(page.locator("#folder-selection")).toBeVisible()
  await expect(page.locator("#select")).toBeEnabled()
  await expect(page.locator("#download")).toBeHidden()
  await expect(page.locator("#convert")).toBeDisabled()
})
test("read-only directory handles and cancelled selection retain a valid review", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/")
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  const fixtures = [
    {
      route: "Etterna → osu!mania",
      name: "Readonly-Etterna",
      files: await createEtternaSourceFixture(),
    },
    { route: "osu!mania → Etterna", name: "Readonly-Osu", files: await createOsuSourceFixture() },
  ]
  for (const fixture of fixtures) {
    await page.getByRole("radio", { name: fixture.route }).check()
    await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
    const files = [...fixture.files].map(([name, bytes]) => ({
      name,
      bytes: [...bytes],
    }))
    await page.evaluate(
      async ({ files, name }) => {
        const root = await navigator.storage.getDirectory()
        const directory = await root.getDirectoryHandle(name, { create: true })
        for (const file of files) {
          const parts = file.name.split("/")
          let parent = directory
          for (const segment of parts.slice(0, -1))
            parent = await parent.getDirectoryHandle(segment, { create: true })
          const handle = await parent.getFileHandle(parts.at(-1) ?? file.name, { create: true })
          const writer = await handle.createWritable()
          await writer.write(new Uint8Array(file.bytes))
          await writer.close()
        }
        Object.defineProperty(window, "showDirectoryPicker", {
          configurable: true,
          value: async (options: { mode: string }) => {
            if (options.mode !== "read") throw new Error("Expected read-only permission")
            return directory
          },
        })
      },
      { files, name: fixture.name },
    )
    await page.locator("#select").click()
    await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
    await page.locator("#next").click()
    await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
    const selected = await page.locator("#selection").textContent()
    await page.locator("#back").click()
    await page.evaluate(() =>
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: async () => {
          throw new DOMException("Cancelled", "AbortError")
        },
      }),
    )
    await page.locator("#select").click()
    await expect(page.locator("#source-stage")).toBeVisible()
    await expect(page.locator("#next")).toBeEnabled()
    expect(await page.locator("#selection").textContent()).toBe(selected)
  }
  await page.reload()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#selection")).toHaveText("No folder selected yet")
  await expect(page.locator("#convert")).toBeDisabled()
})
test("failed WASM initialization blocks selection and shows an actionable error", async ({
  page,
  context,
}) => {
  await context.route("**/vips.wasm", (route) => route.abort())
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/")
  await expect(page.locator("#error")).toContainText("initialize", { timeout: 30000 })
  await expect(page.locator("#select")).toBeDisabled()
  await expect(page.locator("#convert")).toBeDisabled()
})
