import path from "node:path"
import { expect, test } from "@playwright/test"
import { decodeReference } from "../support/image-reference.ts"
import {
  createEtternaSourceFixture,
  createOsuSourceFixture,
} from "../support/migration-source-fixtures.ts"

const fixtureRoot = path.resolve(".tmp/presentation-fixture/Osu")
const etternaRoot = path.resolve(".tmp/presentation-fixture/Etterna")
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
    for (const selector of [
      ".session-heading p",
      ".eyebrow",
      ".four-keys",
      "footer p:first-child",
      "footer a",
    ]) {
      const text = page.locator(selector).first()
      await text.scrollIntoViewIfNeeded()
      const region = await text.evaluate((node) => {
        const box = node.getBoundingClientRect()
        const color = getComputedStyle(node).color
        const opacity = Number(getComputedStyle(node).opacity)
        node.style.visibility = "hidden"
        return { x: box.x, y: box.y, width: box.width, height: box.height, color, opacity }
      })
      const rgb = region.color.match(/\d+(?:\.\d+)?/g)?.map(Number)
      if (rgb?.length !== 3) throw new Error("Expected opaque RGB text color")
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
          const foreground = luminance(
            (rgb[0] ?? 0) * region.opacity + (image.pixels[offset] ?? 0) * (1 - region.opacity),
            (rgb[1] ?? 0) * region.opacity + (image.pixels[offset + 1] ?? 0) * (1 - region.opacity),
            (rgb[2] ?? 0) * region.opacity + (image.pixels[offset + 2] ?? 0) * (1 - region.opacity),
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
  for (const [name, bytes] of await createEtternaSourceFixture())
    await Bun.write(path.join(etternaRoot, name), bytes)
})

test("folder controls are replaced by processing stages throughout worker discovery and conversion", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        const send = () =>
          Array.isArray(options)
            ? super.postMessage(message, options)
            : super.postMessage(message, options)
        if (
          typeof message === "object" &&
          message !== null &&
          "kind" in message &&
          ["discover", "inspect", "convert"].includes(String(message.kind))
        ) {
          document.documentElement.dataset.workerJob = String(message.kind)
          window.addEventListener("release-worker-job", send, { once: true })
        } else send()
      }
    }
  })
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.locator("#folder").setInputFiles(etternaRoot)
  await expect(page.locator("html")).toHaveAttribute("data-worker-job", "discover")
  await expect(page.locator("#folder-selection")).toBeHidden()
  await expect(page.locator("#processing")).toBeVisible()
  await expect(page.locator("#processing-stage")).toHaveText("Checking the folder…")
  await page.locator("#language").selectOption("pt-BR")
  await page.locator("#ui-theme").selectOption("light")
  await expect(page.locator("#processing-stage")).toHaveText("Verificando a pasta…")
  await page.screenshot({ path: ".tmp/ui-processing.png", animations: "disabled" })
  await page.evaluate(() => window.dispatchEvent(new Event("release-worker-job")))
  await expect(page.locator("html")).toHaveAttribute("data-worker-job", "inspect")
  await expect(page.locator("#folder-selection")).toBeHidden()
  await expect(page.locator("#processing-stage")).toHaveText("Lendo e validando a skin…")
  await page.evaluate(() => window.dispatchEvent(new Event("release-worker-job")))
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#processing")).toBeHidden()
  await expect(page.locator("#folder-selection")).toBeVisible()
  await page.locator("#convert").click()
  await expect(page.locator("#processing")).toBeVisible()
  await expect(page.locator("#folder-selection")).toBeHidden()
  await page.evaluate(() => window.dispatchEvent(new Event("release-worker-job")))
  await expect(page.locator("#download")).toBeVisible({ timeout: 30000 })
  await expect(page.locator("#processing")).toBeHidden()
  await expect(page.locator("#folder-selection")).toBeVisible()
})

test("starts in English and exchanges the game background with the route", async ({ page }) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(
    page.getByRole("heading", { name: "Skin converter (4K only)", exact: true }),
  ).toBeVisible()
  await expect(page.getByText("4K MODE", { exact: true })).toHaveCount(0)
  await expect(page.getByText("LOCAL PROCESSING", { exact: true })).toHaveCount(0)
  await expect(page.locator("#language option[value=en]")).toHaveText("🇺🇸 English")
  await expect(page.locator("#language option[value=pt-BR]")).toHaveText("🇧🇷 Português")
  await expect(page.locator("#ui-theme option[value=dark]")).toHaveText("🌙 Dark")
  await expect(page.locator("#ui-theme option[value=light]")).toHaveText("☀️ Light")
  await expect(page.locator("#source-title")).toHaveText("Select your Etterna installation")
  const track = page.locator("#background-track")
  await expect(track).toHaveCSS("transition-timing-function", "linear")
  const width = await page.evaluate(() => window.innerWidth)
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  const samples = await track.evaluate(async (node) => {
    const animation = node.getAnimations()[0]
    if (!animation?.effect) throw new Error("Expected a moving background")
    animation.pause()
    const duration = Number(animation.effect.getTiming().duration)
    const positions: number[] = []
    for (const fraction of [0.25, 0.5, 0.75]) {
      animation.currentTime = duration * fraction
      positions.push(node.getBoundingClientRect().x)
    }
    animation.finish()
    return positions
  })
  for (const [index, x] of samples.entries()) expect(x).toBeCloseTo((-width * (index + 1)) / 4, 0)
  await expect(track).toHaveCSS("opacity", "1")
  await expect(page.locator("#source-title")).toHaveText("Select your osu!mania skin folder")
  await expect(page.locator("#manual-speed a")).toHaveAttribute("href", "https://cmodcalc.com/")
  const duration = await page
    .locator("#background-track")
    .evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(Number.parseFloat(duration)).toBeGreaterThan(0)
  for (const theme of ["dark", "light"]) {
    await page.locator("#ui-theme").selectOption(theme)
    const colors = await page.evaluate(() => ({
      border: getComputedStyle(document.querySelector(".converter") as HTMLElement).borderTopColor,
      osu: getComputedStyle(document.querySelector(".osu-name") as HTMLElement).color,
    }))
    expect(colors.border).toBe(colors.osu)
  }
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
  await expect(page.locator("#background-track")).toHaveCSS("opacity", "1")
  await expect(page.locator("#background-track")).toHaveCSS("transition-duration", "0s")
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: ".tmp/ui-mobile.png", fullPage: true })
})
