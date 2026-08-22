import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"
import { judgementGrades } from "../../../domain/judgement.ts"
import { analyzeEtternaJudgementSheet } from "./analyze-etterna-judgement-sheet.ts"

async function writeJudgementSheet(
  filePath: string,
  columns: number,
  rows: number,
  frameWidth: number,
  frameHeight: number,
): Promise<void> {
  const width = columns * frameWidth
  const height = rows * frameHeight
  const data = Buffer.alloc(width * height * 4)

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          const sourceX = column * frameWidth + x
          const sourceY = row * frameHeight + y
          const offset = (sourceY * width + sourceX) * 4
          data[offset] = row * 30
          data[offset + 1] = column * 120
          data[offset + 2] = 255 - row * 30
          data[offset + 3] = x === 0 && y === 0 ? 0 : 255
        }
      }
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(filePath)
}

test("analyzes supported judgement layouts and rejects invalid sheets", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vsrg-judgement-sheet-"))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const oneBySixPath = path.join(directory, "Fixture 1x6.png")
  const twoBySixDoubleresPath = path.join(directory, "Fixture 2x6 (Doubleres).png")
  await writeJudgementSheet(oneBySixPath, 1, 6, 7, 5)
  await writeJudgementSheet(twoBySixDoubleresPath, 2, 6, 7, 5)

  const oneColumn = await analyzeEtternaJudgementSheet(oneBySixPath)
  assert.equal(oneColumn.sourceDensity, 1)
  assert.deepEqual(
    judgementGrades.map((grade) => oneColumn.images[grade]?.frame?.index),
    [0, 1, 2, 3, 4, 5],
  )

  const twoColumns = await analyzeEtternaJudgementSheet(twoBySixDoubleresPath)
  assert.equal(twoColumns.sourceDensity, 2)
  assert.deepEqual(
    judgementGrades.map((grade) => twoColumns.images[grade]?.frame?.index),
    [0, 2, 4, 6, 8, 10],
  )

  const noLayoutPath = path.join(directory, "No Layout.png")
  const threeBySixPath = path.join(directory, "Invalid 3x6.png")
  const indivisiblePath = path.join(directory, "Invalid 2x6.png")
  await writeJudgementSheet(noLayoutPath, 1, 6, 7, 5)
  await writeJudgementSheet(threeBySixPath, 3, 6, 7, 5)
  await sharp({
    create: {
      width: 15,
      height: 36,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toFile(indivisiblePath)

  await assert.rejects(() => analyzeEtternaJudgementSheet(noLayoutPath), /expected 1x6 or 2x6/i)
  await assert.rejects(() => analyzeEtternaJudgementSheet(threeBySixPath), /expected 1x6 or 2x6/i)
  await assert.rejects(() => analyzeEtternaJudgementSheet(indivisiblePath), /dimensions.*layout/i)
})
