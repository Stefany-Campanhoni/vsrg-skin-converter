import { expect, test } from "bun:test"
import { expectRejectionSatisfies, expectTruthy } from "../../../../tests/support/expectations.ts"
import type { ImageAsset } from "../../../domain/image.ts"
import { type JudgementSet, judgementGrades } from "../../../domain/judgement.ts"
import type { SkinModel } from "../../../domain/skin.ts"
import type { CenteredSpriteSheetFrame } from "../../../infrastructure/image/compose-centered-vertical-sprite-sheet.ts"
import type { JudgementImageVariants } from "../../../infrastructure/image/sharp-judgement-processor.ts"
import { EtternaJudgementWriter } from "./etterna-judgement-writer.ts"

const defaultSheetPath = "templates/etterna/judgement/osu!mania-default 1x6.png"

test("renders complete custom judgements in row order without loading the fallback sheet", async () => {
  const rendered: Array<{
    definition: ImageAsset
    sourceDensity: 1 | 2
    scale: number
  }> = []
  let composedFrames: readonly CenteredSpriteSheetFrame[] = []
  const writes: Array<{ path: string; data: Buffer }> = []
  const custom = completeJudgements("custom", 1)
  const writer = new EtternaJudgementWriter(defaultSheetPath, {
    analyzeDefaultJudgements: async () =>
      (() => {
        throw new Error("complete custom set must not load fallback")
      })(),
    render: async (definition, sourceDensity, scale) => {
      rendered.push({ definition, sourceDensity, scale })
      return variants(definition.filePath)
    },
    compose: async (frames) => {
      composedFrames = frames
      return Buffer.from("sheet")
    },
    writeFile: async (filePath, data) => {
      writes.push({ path: filePath, data })
    },
  })

  await writer.writeJudgement(etternaSkin(custom), "staging/judgement.png")

  expect(
    rendered.map(({ definition, sourceDensity, scale }) => ({
      filePath: definition.filePath,
      sourceDensity,
      scale,
    })),
  ).toStrictEqual(
    judgementGrades.map((grade) => ({
      filePath: `custom-${grade}.png`,
      sourceDensity: 1,
      scale: 1,
    })),
  )
  expect(
    composedFrames.map(({ label, image }) => ({ label, image: image.toString() })),
  ).toStrictEqual(
    judgementGrades.map((grade) => ({ label: grade, image: `sd:custom-${grade}.png` })),
  )
  expect(writes).toStrictEqual([{ path: "staging/judgement.png", data: Buffer.from("sheet") }])
})

test("fills only missing standard-density grades from extracted fallback frames", async () => {
  const fallback = completeJudgements("fallback", 1, true)
  const judgements: JudgementSet = {
    sourceDensity: 1,
    images: {
      perfect: { filePath: "custom-perfect.png", rotation: 0, pixelDensity: "standard" },
      miss: { filePath: "custom-miss.png", rotation: 0, pixelDensity: "standard" },
    },
  }
  const rendered: Array<{ definition: ImageAsset; sourceDensity: 1 | 2 }> = []
  let analyzedPath: string | undefined
  let composedFrames: readonly CenteredSpriteSheetFrame[] = []
  const writer = new EtternaJudgementWriter(defaultSheetPath, {
    analyzeDefaultJudgements: async (filePath) => {
      analyzedPath = filePath
      return fallback
    },
    render: async (definition, sourceDensity) => {
      rendered.push({ definition, sourceDensity })
      return variants(definition.filePath)
    },
    compose: async (frames) => {
      composedFrames = frames
      return Buffer.from("sheet")
    },
    writeFile: async () => {},
  })

  await writer.writeJudgement(etternaSkin(judgements), "output.png")

  expect(analyzedPath).toBe(defaultSheetPath)
  expect(
    rendered.map(({ definition, sourceDensity }) => ({
      filePath: definition.filePath,
      frame: definition.frame,
      sourceDensity,
    })),
  ).toStrictEqual(
    judgementGrades.map((grade, index) => ({
      filePath:
        grade === "perfect" || grade === "miss" ? `custom-${grade}.png` : `fallback-${grade}.png`,
      frame: grade === "perfect" || grade === "miss" ? undefined : { index, columns: 1, rows: 6 },
      sourceDensity: 1,
    })),
  )
  expect(
    composedFrames.map(({ label, image }) => ({ label, image: image.toString() })),
  ).toStrictEqual(
    judgementGrades.map((grade) => ({
      label: grade,
      image: `sd:${grade === "perfect" || grade === "miss" ? "custom" : "fallback"}-${grade}.png`,
    })),
  )
})

test("doubles every default frame when all @2x judgements are absent", async () => {
  const fallback = completeJudgements("fallback", 1, true)
  const renderedDensities: Array<1 | 2> = []
  let composedFrames: readonly CenteredSpriteSheetFrame[] = []
  const writer = new EtternaJudgementWriter(defaultSheetPath, {
    analyzeDefaultJudgements: async () => fallback,
    render: async (definition, sourceDensity) => {
      renderedDensities.push(sourceDensity)
      return variants(definition.filePath)
    },
    compose: async (frames) => {
      composedFrames = frames
      return Buffer.from("sheet")
    },
    writeFile: async () => {},
  })

  await writer.writeJudgement(
    etternaSkin({ sourceDensity: 2, images: {} }),
    "output (Doubleres).png",
  )

  expect(renderedDensities).toStrictEqual([1, 1, 1, 1, 1, 1])
  expect(
    composedFrames.map(({ label, image }) => ({ label, image: image.toString() })),
  ).toStrictEqual(
    judgementGrades.map((grade) => ({ label: grade, image: `hd:fallback-${grade}.png` })),
  )
})

test("rejects non-Etterna and judgement-free models before loading the fallback", async () => {
  let analyses = 0
  const writer = new EtternaJudgementWriter(defaultSheetPath, {
    analyzeDefaultJudgements: async () => {
      analyses += 1
      return completeJudgements("fallback", 1)
    },
    render: async (definition) => variants(definition.filePath),
    compose: async () => Buffer.alloc(0),
    writeFile: async () => {},
  })
  const skin = etternaSkin(completeJudgements("custom", 1))

  await expect(
    (() => writer.writeJudgement({ ...skin, game: "osu" }, "output.png"))(),
  ).rejects.toThrow(/cannot write.*osu/i)
  await expect(
    (() =>
      writer.writeJudgement(
        { ...skin, assets: { ...skin.assets, judgements: undefined } },
        "output.png",
      ))(),
  ).rejects.toThrow(/does not contain judgements/i)
  expect(analyses).toBe(0)
})

test("settles every judgement render before rethrowing the first contextual failure", async () => {
  const failures = [new Error("marvelous failed"), new Error("perfect failed")]
  let started = 0
  let settled = 0
  const writer = new EtternaJudgementWriter(defaultSheetPath, {
    analyzeDefaultJudgements: async () =>
      (() => {
        throw new Error("fallback must not load")
      })(),
    render: (definition) => {
      const index = started++
      return new Promise<JudgementImageVariants>((resolve, reject) => {
        setImmediate(() => {
          settled += 1
          if (index < failures.length) reject(failures[index])
          else resolve(variants(definition.filePath))
        })
      })
    },
    compose: async () => Buffer.alloc(0),
    writeFile: async () => {},
  })

  await expectRejectionSatisfies(
    (() => writer.writeJudgement(etternaSkin(completeJudgements("custom", 1)), "output.png"))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/marvelous.*custom-marvelous\.png/i)
      expect(error.cause).toBe(failures[0])
      return true
    },
  )
  expect(started).toBe(6)
  expect(settled).toBe(6)
})

test("rejects an incomplete fallback before starting any judgement render", async () => {
  const fallback = completeJudgements("fallback", 1, true)
  delete fallback.images.miss
  let renders = 0
  const writer = new EtternaJudgementWriter(defaultSheetPath, {
    analyzeDefaultJudgements: async () => fallback,
    render: async (definition) => {
      renders += 1
      return variants(definition.filePath)
    },
    compose: async () => Buffer.from("sheet"),
    writeFile: async () => {},
  })

  await expect(
    (() => writer.writeJudgement(etternaSkin({ sourceDensity: 1, images: {} }), "output.png"))(),
  ).rejects.toThrow(/default Etterna judgement.*does not contain miss/i)
  expect(renders).toBe(0)
})

test("preserves fallback analysis, compositor, and writer failures as contextual causes", async () => {
  const analysisFailure = new Error("fallback analysis failed")
  const composeFailure = new Error("compose failed")
  const writeFailure = new Error("write failed")
  const missingJudgements: JudgementSet = { sourceDensity: 1, images: {} }
  const customSkin = etternaSkin(completeJudgements("custom", 1))

  await expectRejectionSatisfies(
    (() =>
      new EtternaJudgementWriter(defaultSheetPath, {
        analyzeDefaultJudgements: async () => {
          throw analysisFailure
        },
        render: async (definition) => variants(definition.filePath),
        compose: async () => Buffer.from("sheet"),
        writeFile: async () => {},
      }).writeJudgement(etternaSkin(missingJudgements), "output.png"))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/default Etterna judgement.*default 1x6\.png/i)
      expect(error.cause).toBe(analysisFailure)
      return true
    },
  )

  await expectRejectionSatisfies(
    (() =>
      new EtternaJudgementWriter(defaultSheetPath, {
        analyzeDefaultJudgements: async () =>
          (() => {
            throw new Error("fallback must not load")
          })(),
        render: async (definition) => variants(definition.filePath),
        compose: async () => {
          throw composeFailure
        },
        writeFile: async () => {},
      }).writeJudgement(customSkin, "output.png"))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/compose Etterna judgement/i)
      expect(error.cause).toBe(composeFailure)
      return true
    },
  )

  await expectRejectionSatisfies(
    (() =>
      new EtternaJudgementWriter(defaultSheetPath, {
        analyzeDefaultJudgements: async () =>
          (() => {
            throw new Error("fallback must not load")
          })(),
        render: async (definition) => variants(definition.filePath),
        compose: async () => Buffer.from("sheet"),
        writeFile: async () => {
          throw writeFailure
        },
      }).writeJudgement(customSkin, "output.png"))(),
    (error) => {
      expectTruthy(error instanceof Error)
      expect(error.message).toMatch(/write Etterna judgement.*output\.png/i)
      expect(error.cause).toBe(writeFailure)
      return true
    },
  )
})

function variants(filePath: string): JudgementImageVariants {
  return {
    standardResolution: Buffer.from(`sd:${filePath}`),
    doubleResolution: Buffer.from(`hd:${filePath}`),
  }
}

function completeJudgements(
  prefix: string,
  sourceDensity: 1 | 2,
  includeFrames = false,
): JudgementSet {
  const images = Object.fromEntries(
    judgementGrades.map((grade, index) => [
      grade,
      {
        filePath: `${prefix}-${grade}.png`,
        rotation: 0,
        ...(includeFrames ? { frame: { index, columns: 1, rows: 6 } } : {}),
      },
    ]),
  ) as JudgementSet["images"]
  return { sourceDensity, images }
}

function etternaSkin(judgements: JudgementSet): SkinModel {
  return {
    game: "etterna",
    metadata: { name: "Skin" },
    playfield: {
      hitPosition: 0,
      judgementPosition: 0,
      comboPosition: 0,
      columnWidth: 100,
      comboScale: 1,
      judgementScale: 1,
      scrollSpeed: 1,
    },
    assets: { judgements },
    diagnostics: [],
  }
}
