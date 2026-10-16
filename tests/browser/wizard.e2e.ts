import path from "node:path"
import { expect, test } from "@playwright/test"
import {
  createEtternaSourceFixture,
  createOsuSourceFixture,
} from "../support/migration-source-fixtures.ts"

const address = "http://127.0.0.1:4173/vsrg-skin-converter/"
const sourceRoot = path.resolve(".tmp/wizard-fixtures")
test.beforeAll(async () => {
  for (const [game, files] of [
    ["Etterna", await createEtternaSourceFixture()],
    ["Osu", await createOsuSourceFixture()],
  ] as const)
    for (const [name, bytes] of files) await Bun.write(path.join(sourceRoot, game, name), bytes)
})

test("file-list selection shows feedback before files arrive and restores the card on cancellation", async ({
  page,
}) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.evaluate(() =>
    document.getElementById("folder")?.addEventListener("click", (event) => event.preventDefault()),
  )
  await page.locator("#fallback").click()
  await expect(page.locator("#processing")).toBeVisible()
  await expect(page.locator("#source-stage")).toBeHidden()
  await expect(page.locator("#processing-stage")).toHaveText("Waiting for the selected folder…")
  await page.locator("#language").selectOption("pt-BR")
  await expect(page.locator("#processing-stage")).toHaveText("Aguardando a pasta selecionada…")
  await page.evaluate(() => document.getElementById("folder")?.dispatchEvent(new Event("cancel")))
  await expect(page.locator("#processing")).toBeHidden()
  await expect(page.locator("#source-stage")).toBeVisible()
  await expect(page.locator("#select")).toBeEnabled()
})

test("each wizard step replaces the main card and review displays four notes and receptors", async ({
  page,
}) => {
  for (const [route, game] of [
    ["Etterna → osu!mania", "Etterna"],
    ["osu!mania → Etterna", "Osu"],
  ] as const) {
    await page.goto(address)
    await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
    await page.getByRole("radio", { name: route }).check()
    await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
    await expect(page.locator("#source-stage")).toBeVisible()
    await expect(page.locator("#review-stage")).toBeHidden()
    await expect(page.locator("#download-stage")).toBeHidden()
    await page.locator("#folder").setInputFiles(path.join(sourceRoot, game))
    await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
    const optionValues = await page
      .locator("#options select")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node instanceof HTMLSelectElement ? node.value : "")),
      )
    await expect(page.locator("[data-step=source]")).toHaveAttribute("aria-current", "step")
    await page.locator("#next").click()
    await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
    await expect(page.locator("#source-stage")).toBeHidden()
    await expect(page.locator("#review-stage")).toBeVisible()
    await expect(page.locator("#download-stage")).toBeHidden()
    await expect(page.locator("[data-step=review]")).toHaveAttribute("aria-current", "step")
    await expect(page.locator("#skin-artwork .note-image")).toHaveCount(4)
    await expect(page.locator("#skin-artwork .receptor-image")).toHaveCount(4)
    for (const image of await page.locator("#skin-artwork img").all()) {
      await expect(image).toHaveAttribute("src", /^blob:/)
      expect(
        await image.evaluate(
          (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
        ),
      ).toBe(true)
    }
    const imageUrls = await page
      .locator("#skin-artwork img")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")))
    await page.locator("#language").selectOption("pt-BR")
    expect(
      await page
        .locator("#skin-artwork img")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src"))),
    ).toEqual(imageUrls)
    await page.locator("#back").click()
    await expect(page.locator("#source-stage")).toBeVisible()
    await expect(page.locator("#review-stage")).toBeHidden()
    await expect(page.locator("#selection")).toContainText(game)
    expect(
      await page
        .locator("#options select")
        .evaluateAll((nodes) =>
          nodes.map((node) => (node instanceof HTMLSelectElement ? node.value : "")),
        ),
    ).toEqual(optionValues)
    await page.locator("#next").click()
    await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
    expect(
      await page.evaluate(
        async (urls) =>
          Promise.all(
            urls.map(async (url) => {
              try {
                await fetch(url ?? "")
                return true
              } catch {
                return false
              }
            }),
          ),
        imageUrls,
      ),
    ).toEqual(Array(8).fill(false))
    const replacementUrls = await page
      .locator("#skin-artwork img")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")))
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: `.tmp/ui-wizard-review-${game}.png`,
      animations: "disabled",
      fullPage: true,
    })
    await page.locator("#convert").click()
    await expect(page.locator("#download")).toBeVisible({ timeout: 30000 })
    await expect(page.locator("#source-stage")).toBeHidden()
    await expect(page.locator("#review-stage")).toBeHidden()
    await expect(page.locator("#download-stage")).toBeVisible()
    await expect(page.locator("[data-step=download]")).toHaveAttribute("aria-current", "step")
    await page.locator("#reset").click()
    await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
    await expect(page.locator("#source-stage")).toBeVisible()
    await expect(page.locator("#skin-artwork img")).toHaveCount(0)
    expect(
      await page.evaluate(
        async (urls) =>
          Promise.all(
            urls.map(async (url) => {
              try {
                await fetch(url ?? "")
                return true
              } catch {
                return false
              }
            }),
          ),
        replacementUrls,
      ),
    ).toEqual(Array(8).fill(false))
  }
})

test("failed conversion restores Source instead of showing a ready download", async ({ page }) => {
  const invalidRoot = path.join(sourceRoot, "Changed-Osu")
  for (const [name, bytes] of await createOsuSourceFixture())
    await Bun.write(path.join(invalidRoot, name), bytes)
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await page.locator("#folder").setInputFiles(invalidRoot)
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await page.locator("#next").click()
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await Bun.write(path.join(invalidRoot, "skin.ini"), "[Mania]\nKeys=7\n")
  await page.locator("#convert").click()
  await expect(page.locator("#error")).toBeVisible({ timeout: 30000 })
  await expect(page.locator("#download-stage")).toBeHidden()
  await expect(page.locator("#download")).toBeHidden()
  await expect(page.locator("#source-stage")).toBeVisible()
  await expect(page.locator("#select")).toBeEnabled()
})

test("native picker shows feedback while pending and ignores its handle after reset", async ({
  page,
}) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.evaluate(() =>
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: (options: { mode: string }) =>
        new Promise<FileSystemDirectoryHandle>((resolve, reject) => {
          if (options.mode !== "read") return reject(new Error("Expected read-only picker"))
          window.addEventListener(
            "release-picker",
            async () => {
              resolve(await navigator.storage.getDirectory())
              document.documentElement.dataset.pickerDelivered = "true"
            },
            { once: true },
          )
        }),
    }),
  )
  await page.locator("#select").click()
  await expect(page.locator("#processing-stage")).toHaveText("Waiting for the selected folder…")
  await expect(page.locator("#source-stage")).toBeHidden()
  await page.locator("#reset").click()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await page.evaluate(() => window.dispatchEvent(new Event("release-picker")))
  await expect(page.locator("html")).toHaveAttribute("data-picker-delivered", "true")
  await expect(page.locator("#selection")).toHaveText("No folder selected yet")
  await expect(page.locator("#error")).toBeHidden()
  await expect(page.locator("#processing")).toBeHidden()
  await expect(page.locator("#next")).toBeDisabled()
})

test("reset ignores files delivered by a previously opened picker", async ({ page }) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.evaluate(() =>
    document.getElementById("folder")?.addEventListener("click", (event) => event.preventDefault()),
  )
  await page.locator("#fallback").click()
  await expect(page.locator("#processing")).toBeVisible()
  await page.locator("#reset").click()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await page.locator("#folder").setInputFiles(path.join(sourceRoot, "Etterna"))
  await expect(page.locator("#selection")).toHaveText("No folder selected yet")
  await expect(page.locator("#next")).toBeDisabled()
  await page.locator("#fallback").click()
  await page.locator("#folder").setInputFiles(path.join(sourceRoot, "Etterna"))
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#selection")).toContainText("Etterna")
})
