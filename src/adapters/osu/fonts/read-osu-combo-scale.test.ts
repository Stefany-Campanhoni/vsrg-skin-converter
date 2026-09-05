import { test } from "bun:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { osuTemplatesPath } from "../../../config/paths.ts"
import { readOsuComboScale } from "./read-osu-combo-scale.ts"

for (const useDoubleResolutionAssets of [false, true]) {
  test(`maps the real osu template font to scale one at ${useDoubleResolutionAssets ? "double" : "standard"} density`, async () => {
    assert.equal(
      await readOsuComboScale({
        skinDirectory: osuTemplatesPath,
        comboPrefix: "combo",
        useDoubleResolutionAssets,
      }),
      1,
    )
  })
}

for (const fixture of [
  { name: "standard", useDoubleResolutionAssets: false, suffix: "", height: 21 },
  { name: "double", useDoubleResolutionAssets: true, suffix: "@2x", height: 42 },
] as const) {
  test(`derives a half-size combo scale from ${fixture.name}-density digits`, async () => {
    await withSkin(async (skinDirectory) => {
      await writeDigits(skinDirectory, fixture.suffix, () => fixture.height)

      assert.equal(
        await readOsuComboScale({
          skinDirectory,
          comboPrefix: "fonts/combo",
          useDoubleResolutionAssets: fixture.useDoubleResolutionAssets,
        }),
        0.5,
      )
    })
  })
}

test("uses scale one silently when any selected combo digit is absent", async () => {
  await withSkin(async (skinDirectory) => {
    await writeDigits(skinDirectory, "", () => 42, 9)

    assert.equal(
      await readOsuComboScale({
        skinDirectory,
        comboPrefix: "fonts/combo",
        useDoubleResolutionAssets: false,
      }),
      1,
    )
  })
})

test("does not fall back across densities when the selected combo font is absent", async () => {
  await withSkin(async (skinDirectory) => {
    await writeDigits(skinDirectory, "", () => 42)

    assert.equal(
      await readOsuComboScale({
        skinDirectory,
        comboPrefix: "fonts/combo",
        useDoubleResolutionAssets: true,
      }),
      1,
    )
  })
})

test("uses the median scale when selected digit heights vary by one pixel", async () => {
  await withSkin(async (skinDirectory) => {
    await writeDigits(skinDirectory, "", (digit) => (digit >= 8 ? 22 : 21))

    assert.equal(
      await readOsuComboScale({
        skinDirectory,
        comboPrefix: "fonts/combo",
        useDoubleResolutionAssets: false,
      }),
      0.5,
    )
  })
})

test("rejects digit heights that cannot represent one consistent combo scale", async () => {
  await withSkin(async (skinDirectory) => {
    await writeDigits(skinDirectory, "", (digit) => (digit === 9 ? 25 : 21))

    await assert.rejects(
      () =>
        readOsuComboScale({
          skinDirectory,
          comboPrefix: "fonts/combo",
          useDoubleResolutionAssets: false,
        }),
      /inconsistent.*combo.*height/i,
    )
  })
})

test("rejects inconsistent present digits even when another digit is absent", async () => {
  await withSkin(async (skinDirectory) => {
    await writeDigits(skinDirectory, "", (digit) => (digit === 8 ? 25 : 21), 9)

    await assert.rejects(
      () =>
        readOsuComboScale({
          skinDirectory,
          comboPrefix: "fonts/combo",
          useDoubleResolutionAssets: false,
        }),
      /inconsistent.*combo.*height/i,
    )
  })
})

test("does not reinterpret an invalid selected combo image as a missing font", async () => {
  await withSkin(async (skinDirectory) => {
    await writeDigits(skinDirectory, "", () => 42, 9)
    await writeFile(path.join(skinDirectory, "fonts", "combo-0.png"), "not an image")

    await assert.rejects(
      () =>
        readOsuComboScale({
          skinDirectory,
          comboPrefix: "fonts/combo",
          useDoubleResolutionAssets: false,
        }),
      (error) =>
        error instanceof Error &&
        /combo digit 0/i.test(error.message) &&
        error.cause instanceof Error,
    )
  })
})

async function withSkin(run: (skinDirectory: string) => Promise<void>): Promise<void> {
  const skinDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-osu-combo-scale-"))
  try {
    await mkdir(path.join(skinDirectory, "fonts"))
    await run(skinDirectory)
  } finally {
    await rm(skinDirectory, { recursive: true, force: true })
  }
}

async function writeDigits(
  skinDirectory: string,
  suffix: "" | "@2x",
  height: (digit: number) => number,
  count = 10,
): Promise<void> {
  await Promise.all(
    Array.from({ length: count }, async (_, digit) => {
      await sharp({
        create: {
          width: 12,
          height: height(digit),
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toFile(path.join(skinDirectory, "fonts", `combo-${digit}${suffix}.png`))
    }),
  )
}
