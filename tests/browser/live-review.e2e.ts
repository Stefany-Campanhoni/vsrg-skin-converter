import path from "node:path"
import { expect, type Locator, test } from "@playwright/test"
import sharp from "sharp"
import {
  createEtternaSourceFixture,
  createOsuSourceFixture,
} from "../support/migration-source-fixtures.ts"

const address = "http://127.0.0.1:4173/vsrg-skin-converter/"
const root = path.resolve(".tmp/live-review-fixtures")
async function color(image: Locator) {
  return image.evaluate((node) => {
    if (!(node instanceof HTMLImageElement) || !node.complete)
      throw new Error("Missing decoded preview")
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Missing image context")
    context.drawImage(node, 0, 0, 1, 1)
    return [...context.getImageData(0, 0, 1, 1).data]
  })
}
test.beforeAll(async () => {
  const alternate = await sharp({
    create: { width: 32, height: 24, channels: 4, background: { r: 120, g: 220, b: 10, alpha: 1 } },
  })
    .png()
    .toBuffer()
  for (const [name, bytes] of await createEtternaSourceFixture()) {
    await Bun.write(path.join(root, "Etterna", name), bytes)
    if (name.startsWith("NoteSkins/dance/Reference/"))
      await Bun.write(
        path.join(root, "Etterna", name.replace("/Reference/", "/Alternate/")),
        name.endsWith(".png") ? alternate : bytes,
      )
  }
  for (const [name, bytes] of await createOsuSourceFixture()) {
    await Bun.write(path.join(root, "Osu", name), bytes)
    await Bun.write(path.join(root, "Invalid-HD", name), bytes)
    if (name.endsWith(".png")) {
      const hd = await sharp(bytes)
        .resize({ width: 80 })
        .tint({ r: 244, g: 20, b: 120 })
        .png()
        .toBuffer()
      const solidHD = await sharp({
        create: {
          width: 80,
          height: 40,
          channels: 4,
          background: { r: 244, g: 20, b: 120, alpha: 1 },
        },
      })
        .png()
        .toBuffer()
      await Bun.write(path.join(root, "Osu", name.replace(".png", "@2x.png")), solidHD)
      await Bun.write(
        path.join(root, "Invalid-HD", name.replace(".png", "@2x.png")),
        name === "note-left.png" ? new TextEncoder().encode("invalid PNG") : hd,
      )
    }
  }
})

test("Etterna skin and profile controls live in Review and refresh pixels and settings automatically", async ({
  page,
}) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.locator("#folder").setInputFiles(path.join(root, "Etterna"))
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#options")).toBeHidden()
  await page.locator("#next").click()
  await expect(page.locator("#review-stage #skin")).toBeVisible()
  await expect(page.locator("#review-stage #profile")).toBeVisible()
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  const note = page.locator("#skin-artwork .note-image").first()
  await page.locator("#skin").selectOption("NoteSkins/dance/Reference")
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await expect.poll(() => color(note)).toEqual([0, 90, 200, 255])
  await expect(page.locator("#values")).toContainText("ManiaSpeed")
  await page.locator("#skin").selectOption("NoteSkins/dance/Alternate")
  await expect.poll(() => color(note)).toEqual([120, 220, 10, 255])
  await page.locator("#profile").selectOption("")
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#values")).not.toContainText("ManiaSpeed")
  await expect(page.locator("#review-stage")).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: ".tmp/ui-live-review-Etterna.png",
    fullPage: true,
    animations: "disabled",
  })
})

test("density changes remain responsive and only the last queued selection becomes convertible", async ({
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
          message.kind === "inspect"
        ) {
          document.documentElement.dataset.inspectPosts = String(
            Number(document.documentElement.dataset.inspectPosts ?? "0") + 1,
          )
          window.addEventListener("release-inspection", send, { once: true })
        } else send()
      }
    }
  })
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await page.locator("#folder").setInputFiles(path.join(root, "Osu"))
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#options")).toBeHidden()
  await page.locator("#next").click()
  await expect(page.locator("#review-stage #density")).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event("release-inspection")))
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  const note = page.locator("#skin-artwork .note-image").first()
  await expect.poll(() => color(note)).toEqual([0, 90, 200, 255])
  await page.locator("#density").selectOption("hd")
  await expect(page.locator("#convert")).toBeDisabled()
  await expect(page.locator("#review-stage")).toBeVisible()
  await expect(page.locator("#preview-status")).toBeVisible()
  await expect(page.locator("#skin-artwork img")).toHaveCount(8)
  await expect(page.locator("#density")).toBeEnabled()
  await page.locator("#density").selectOption("sd")
  await page.locator("#density").selectOption("hd")
  await expect(page.locator("html")).toHaveAttribute("data-inspect-posts", "2")
  await page.evaluate(() => window.dispatchEvent(new Event("release-inspection")))
  await expect(page.locator("html")).toHaveAttribute("data-inspect-posts", "3")
  await expect(page.locator("#convert")).toBeDisabled()
  await expect.poll(() => color(note)).toEqual([0, 90, 200, 255])
  await page.evaluate(() => window.dispatchEvent(new Event("release-inspection")))
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await expect.poll(() => color(note)).toEqual([244, 20, 120, 255])
  await expect(page.locator("#preview-status")).toBeHidden()
  await expect(page.locator("#error")).toBeHidden()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: ".tmp/ui-live-review-Osu.png",
    fullPage: true,
    animations: "disabled",
  })
})

test("an invalid density clears stale artwork and allows recovery on the Review screen", async ({
  page,
}) => {
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await page.locator("#folder").setInputFiles(path.join(root, "Invalid-HD"))
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await page.locator("#next").click()
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await page.locator("#density").selectOption("hd")
  await expect(page.locator("#error")).toBeVisible({ timeout: 30000 })
  await expect(page.locator("#review-stage")).toBeVisible()
  await expect(page.locator("#density")).toBeEnabled()
  await expect(page.locator("#convert")).toBeDisabled()
  await expect(page.locator("#skin-artwork img")).toHaveCount(0)
  await page.locator("#density").selectOption("sd")
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#error")).toBeHidden()
  await expect
    .poll(() => color(page.locator("#skin-artwork .note-image").first()))
    .toEqual([0, 90, 200, 255])
})

test("a failed worker disables Review controls until Start over reinitializes processing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options)
        window.addEventListener(
          "fail-preview-worker",
          () => this.dispatchEvent(new Event("messageerror")),
          { once: true },
        )
      }
    }
  })
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.getByRole("radio", { name: "osu!mania → Etterna" }).check()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await page.locator("#folder").setInputFiles(path.join(root, "Osu"))
  await expect(page.locator("#next")).toBeEnabled({ timeout: 30000 })
  await page.locator("#next").click()
  await expect(page.locator("#convert")).toBeEnabled({ timeout: 30000 })
  await page.evaluate(() => window.dispatchEvent(new Event("fail-preview-worker")))
  await expect(page.locator("#error")).toContainText("worker stopped")
  await expect(page.locator("#density")).toBeDisabled()
  await expect(page.locator("#convert")).toBeDisabled()
  await expect(page.locator("#preview-status")).toBeHidden()
  await page.locator("#reset").click()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#error")).toBeHidden()
})

test("global failure during folder discovery keeps folder controls disabled until reset", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options)
        window.addEventListener(
          "fail-discovery-worker",
          () => this.dispatchEvent(new Event("messageerror")),
          { once: true },
        )
      }
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if (
          typeof message === "object" &&
          message !== null &&
          "kind" in message &&
          message.kind === "discover"
        ) {
          document.documentElement.dataset.discoveryWaiting = "true"
          return
        }
        Array.isArray(options)
          ? super.postMessage(message, options)
          : super.postMessage(message, options)
      }
    }
  })
  await page.goto(address)
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.locator("#folder").setInputFiles(path.join(root, "Etterna"))
  await expect(page.locator("html")).toHaveAttribute("data-discovery-waiting", "true")
  await page.evaluate(() => window.dispatchEvent(new Event("fail-discovery-worker")))
  await expect(page.locator("#error")).toContainText("worker stopped")
  await expect(page.locator("#select")).toBeDisabled()
  await expect(page.locator("#fallback")).toBeDisabled()
  await page.locator("#reset").click()
  await expect(page.locator("#select")).toBeEnabled({ timeout: 30000 })
  await expect(page.locator("#error")).toBeHidden()
})
