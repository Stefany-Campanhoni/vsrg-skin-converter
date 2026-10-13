import path from "node:path"
import { expect, test } from "@playwright/test"
import { decodeReference } from "../support/image-reference.ts"
import { createOsuSourceFixture } from "../support/migration-source-fixtures.ts"

const fixtureRoot = path.resolve(".tmp/presentation-fixture/Osu")
const address = "http://127.0.0.1:4173/vsrg-skin-converter/"

function luminance(red: number, green: number, blue: number) {
  const linear = (byte: number) => {
    const value = byte / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}

test("light theme keeps small text readable over the rendered game background", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.locator("#ui-theme").selectOption("light")
  for (const direction of ["Etterna → osu!mania", "osu!mania → Etterna"]) {
    await page.getByRole("radio", { name: direction }).check()
    await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
    for (const selector of [".session-heading p", ".eyebrow", "footer p:first-child", "footer a"]) {
      const text = page.locator(selector).first()
      await text.scrollIntoViewIfNeeded()
      const region = await text.evaluate((node) => {
        const box = node.getBoundingClientRect()
        const color = getComputedStyle(node).color
        node.style.visibility = "hidden"
        return { x: box.x, y: box.y, width: box.width, height: box.height, color }
      })
      const rgb = region.color.match(/\d+(?:\.\d+)?/g)?.map(Number)
      if (rgb?.length !== 3) throw new Error("Expected opaque RGB text color")
      const foreground = luminance(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0)
      const image = await decodeReference(
        new Uint8Array(await page.screenshot({ animations: "disabled" })),
      )
      await text.evaluate((node) => {
        node.style.visibility = ""
      })
      let minimum = Number.POSITIVE_INFINITY
      for (
        let y = Math.max(0, Math.floor(region.y));
        y < Math.min(image.height, region.y + region.height);
        y += 2
      )
        for (
          let x = Math.max(0, Math.floor(region.x));
          x < Math.min(image.width, region.x + region.width);
          x += 4
        ) {
          const offset = (y * image.width + x) * 4
          const background = luminance(
            image.pixels[offset] ?? 0,
            image.pixels[offset + 1] ?? 0,
            image.pixels[offset + 2] ?? 0,
          )
          const ratio =
            (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
          minimum = Math.min(minimum, ratio)
        }
      expect(minimum, `${direction}: ${selector}`).toBeGreaterThanOrEqual(4.5)
    }
  }
})

test.beforeAll(async () => {
  for (const [name, bytes] of await createOsuSourceFixture())
    await Bun.write(path.join(fixtureRoot, name), bytes)
})

test("starts in English and exchanges the game background with the route", async ({ page }) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page.getByRole("heading", { name: "Skin converter", exact: true })).toBeVisible()
  await expect(page.locator("#source-title")).toHaveText("Select your Etterna installation")
  await expect(page.locator("#background-forward")).toHaveCSS("opacity", "1")
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#background-reverse")).toHaveCSS("opacity", "1")
  await expect(page.locator("#background-forward")).toHaveCSS("opacity", "0")
  await expect(page.locator("#source-title")).toHaveText("Select your osu!mania skin folder")
  await expect(page.locator("#manual-speed a")).toHaveAttribute("href", "https://cmodcalc.com/")
  const duration = await page
    .locator("#background-reverse")
    .evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(Number.parseFloat(duration)).toBeGreaterThan(0)
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR")
  await expect(page.getByRole("navigation", { name: "Progresso da conversão" })).toBeVisible()
})

test("language and theme retain a reviewed source and the downloadable archive", async ({
  page,
}) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#select")).toBeEnabled()
  await page.locator("#folder").setInputFiles(fixtureRoot)
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  const numbers = await page.locator("#values dd").allTextContents()
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR")
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR")
  await expect(page.locator("#source-title")).toHaveText("Selecione a pasta da skin osu!mania")
  await expect(page.locator("#selection")).toContainText("Osu")
  await expect(page.locator("#convert")).toBeEnabled()
  expect(await page.locator("#values dd").allTextContents()).toEqual(
    numbers.map((value) => (value === "No" ? "Não" : value === "Yes" ? "Sim" : value)),
  )
  await page.getByRole("combobox", { name: "Tema" }).selectOption("light")
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await page.locator("#convert").click()
  await expect(page.locator("#download")).toBeVisible({ timeout: 30000 })
  const archive = await page.locator("#download").getAttribute("href")
  await page.getByRole("combobox", { name: "Idioma" }).selectOption("en")
  await page.getByRole("combobox", { name: "Theme" }).selectOption("dark")
  await expect(page.locator("#download")).toHaveAttribute("href", archive ?? "")
  await expect(page.locator("#download")).toHaveText("Download skin ↓")
  await expect(page.locator("#conversion-status")).toHaveText(
    "Conversion complete. Your ZIP is ready.",
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: ".tmp/ui-dark-reverse.png", animations: "disabled" })
  await page.getByRole("combobox", { name: "Theme" }).selectOption("light")
  await page.screenshot({ path: ".tmp/ui-light-reverse.png", animations: "disabled" })
})

test("mobile layout fits the viewport and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#background-reverse")).toHaveCSS("opacity", "1")
  await expect(page.locator("#background-reverse")).toHaveCSS("transition-duration", "0s")
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: ".tmp/ui-mobile.png", fullPage: true })
})
