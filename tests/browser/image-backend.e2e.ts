import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"

test("browser libvips preserves all captured native decoded pixels", async ({ page }) => {
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
