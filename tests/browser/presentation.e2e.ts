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
    await page.evaluate(() => {
      for (const animation of document.getAnimations())
        if (animation.effect?.getTiming().iterations !== Infinity) animation.finish()
    })
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
        const context = document.createElement("canvas").getContext("2d")
        if (!context) throw new Error("Missing color decoder")
        context.fillStyle = getComputedStyle(node).color
        context.fillRect(0, 0, 1, 1)
        const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
        const opacity = Number(getComputedStyle(node).opacity)
        node.style.visibility = "hidden"
        return { x: box.x, y: box.y, width: box.width, height: box.height, rgb, opacity }
      })
      const rgb = region.rgb
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
  await page.emulateMedia({ reducedMotion: "no-preference" })
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
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR")
  await expect(page.getByRole("navigation", { name: "Progresso da conversão" })).toBeVisible()
})

test("both routes keep identical border shapes and opacity with purple or pink accents", async ({
  page,
}) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  for (const theme of ["dark", "light"]) {
    await page.locator("#ui-theme").selectOption(theme)
    const snapshots = []
    for (const route of ["Etterna → osu!mania", "osu!mania → Etterna"]) {
      await page.getByRole("radio", { name: route }).check()
      await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
      snapshots.push(
        await page.evaluate(() => {
          for (const animation of document.getAnimations())
            if (animation.effect?.getTiming().iterations !== Infinity) animation.finish()
          const canvas = document.createElement("canvas")
          canvas.width = canvas.height = 1
          const context = canvas.getContext("2d")
          if (!context) throw new Error("Missing color decoder")
          const rgba = (color: string) => {
            context.clearRect(0, 0, 1, 1)
            context.fillStyle = color
            context.fillRect(0, 0, 1, 1)
            return [...context.getImageData(0, 0, 1, 1).data]
          }
          const borders = [
            ".converter",
            ".source-panel",
            ".review-panel",
            ".directions label:has(:checked)",
            ".folder-slot",
            "#ui-theme",
          ].map((selector) => {
            const node = document.querySelector(selector)
            if (!node) throw new Error(`Missing ${selector}`)
            const style = getComputedStyle(node)
            return {
              widths: [
                style.borderTopWidth,
                style.borderRightWidth,
                style.borderBottomWidth,
                style.borderLeftWidth,
              ],
              styles: [
                style.borderTopStyle,
                style.borderRightStyle,
                style.borderBottomStyle,
                style.borderLeftStyle,
              ],
              radius: style.borderRadius,
              alpha: [
                style.borderTopColor,
                style.borderRightColor,
                style.borderBottomColor,
                style.borderLeftColor,
              ].map((color) => rgba(color)[3]),
            }
          })
          const selected = document.querySelector(".directions label:has(:checked)")
          if (!selected) throw new Error("Missing selected route")
          return { borders, accent: rgba(getComputedStyle(selected).borderTopColor) }
        }),
      )
    }
    expect(snapshots[1]?.borders, theme).toEqual(snapshots[0]?.borders)
    expect(snapshots[0]?.accent[2] ?? 0).toBeGreaterThan(snapshots[0]?.accent[0] ?? 0)
    expect(snapshots[1]?.accent[0] ?? 0).toBeGreaterThan(snapshots[1]?.accent[2] ?? 0)
  }
})

test("interface and background colors swap gradually even with reduced motion", async ({
  page,
}) => {
  for (const motion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion: motion })
    await page.goto(address)
    await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
    await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
    const duration = await page.evaluate(() => {
      const transition = document.documentElement
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSTransition && animation.transitionProperty === "--route-mix",
        )
      if (!transition?.effect) return 0
      transition.pause()
      for (const animation of document.getElementById("background-track")?.getAnimations() ?? [])
        animation.pause()
      return Number(transition.effect.getTiming().duration)
    })
    expect(duration, motion).toBeGreaterThanOrEqual(600)
    const colors: number[][] = [],
      backgrounds: number[][] = []
    for (const fraction of [0.25, 0.5, 0.75]) {
      colors.push(
        await page.evaluate(
          ({ duration, fraction }) => {
            for (const animation of [
              ...document.documentElement.getAnimations(),
              ...(document.getElementById("background-track")?.getAnimations() ?? []),
            ])
              animation.currentTime = duration * fraction
            const button = document.getElementById("select")
            const context = document.createElement("canvas").getContext("2d")
            if (!button || !context) throw new Error("Missing route button")
            context.fillStyle = getComputedStyle(button).backgroundColor
            context.fillRect(0, 0, 1, 1)
            return [...context.getImageData(0, 0, 1, 1).data]
          },
          { duration, fraction },
        ),
      )
      const image = await decodeReference(new Uint8Array(await page.screenshot()))
      const offset = (5 * image.width + 5) * 4
      backgrounds.push([...image.pixels.slice(offset, offset + 4)])
    }
    expect(colors[0]).not.toEqual(colors[1])
    expect(colors[1]).not.toEqual(colors[2])
    expect(backgrounds[0]).not.toEqual(backgrounds[1])
    expect(backgrounds[1]).not.toEqual(backgrounds[2])
    for (let index = 1; index < backgrounds.length; index++)
      expect(backgrounds[index]?.[0] ?? 0).toBeGreaterThan(backgrounds[index - 1]?.[0] ?? 0)
    await page.evaluate(() => {
      for (const animation of document.getAnimations())
        if (animation.effect?.getTiming().iterations !== Infinity) animation.finish()
    })
  }
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
