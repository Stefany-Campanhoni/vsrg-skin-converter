import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"

test("transformed images are bounded before output materialization", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/")
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/image-backend.html")
  await page.waitForFunction(() => typeof window.runImageLimitProbe === "function")
  expect(await page.evaluate(() => window.runImageLimitProbe())).toBe(true)
})

test("browser libvips preserves all captured native decoded pixels", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/")
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/image-backend.html")
  await page.waitForFunction(() => typeof window.runImageParity === "function")
  const outputs = await page.evaluate(() => window.runImageParity())
  const manifest: unknown = JSON.parse(
    await readFile(".tmp/browser-reference/manifest.json", "utf8"),
  )
  if (!manifest || typeof manifest !== "object") throw new Error("Invalid reference manifest")
  for (const [name, actual] of Object.entries(outputs)) {
    const dimensions: unknown = Reflect.get(manifest, name)
    if (!dimensions || typeof dimensions !== "object") throw new Error("Missing dimensions")
    expect({ width: actual.width, height: actual.height }, name).toEqual({
      width: Reflect.get(dimensions, "width"),
      height: Reflect.get(dimensions, "height"),
    })
    const expected = await readFile(`.tmp/browser-reference/${name}.rgba`)
    const unequal = actual.pixels.reduce(
      (count, value, index) => count + Number(value !== expected[index]),
      0,
    )
    expect.soft(unequal, name).toBe(0)
  }
})
test("applicable local corpus assets preserve native decoded pixels", async ({ page }) => {
  test.setTimeout(360000)
  if (!(await Bun.file(".tmp/browser-reference/corpus.json").exists())) {
    test.skip(true, "No private local corpus prepared")
    return
  }
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/")
  await expect(page.locator("#select")).toBeEnabled({ timeout: 45000 })
  await page.goto("http://127.0.0.1:4173/vsrg-skin-converter/image-backend.html")
  await page.waitForFunction(() => typeof window.runImageCorpusParity === "function")
  const actual = await page.evaluate(() => window.runImageCorpusParity())
  const expected: unknown = await Bun.file(".tmp/browser-reference/corpus.json").json()
  if (!Array.isArray(expected)) throw new Error("Invalid corpus")
  expect(actual).toHaveLength(expected.length)
  for (const [index, result] of actual.entries()) {
    const entry: unknown = expected[index]
    if (!entry || typeof entry !== "object") throw new Error("Invalid corpus entry")
    expect(result).toEqual({
      name: Reflect.get(entry, "name"),
      width: Reflect.get(entry, "width"),
      height: Reflect.get(entry, "height"),
      pixelSha256: Reflect.get(entry, "pixelSha256"),
    })
  }
})
