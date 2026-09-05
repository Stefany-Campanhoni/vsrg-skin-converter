import { test } from "bun:test"
import assert from "node:assert/strict"
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { osuTemplatesPath } from "../../../config/paths.ts"
import { renderTemplateFile, replaceWildcards } from "./render-osu-template.ts"

const skinIniTemplatePath = path.join(osuTemplatesPath, "skin.ini")

test("replaces supplied string and numeric wildcards", () => {
  const template = `\${skin_name}|\${hit_position}|\${zero}|\${empty}`

  assert.equal(
    replaceWildcards(template, {
      skin_name: "My Etterna Skin",
      hit_position: 432,
      zero: 0,
      empty: "",
    }),
    "My Etterna Skin|432|0|",
  )
})

test("replaces every occurrence of a supplied wildcard", () => {
  assert.equal(replaceWildcards(`\${value}-\${value}`, { value: 12 }), "12-12")
})

test("preserves wildcards without a supplied value", () => {
  assert.equal(
    replaceWildcards(`\${skin_name}|\${future_value}`, { skin_name: "Skin" }),
    `Skin|\${future_value}`,
  )
})

test("references the exact @2x receptor filenames", async () => {
  const template = await readFile(skinIniTemplatePath, "utf8")
  const receptorLines = template
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^KeyImage[0-3]D?:/.test(line))

  assert.deepEqual(receptorLines, [
    "KeyImage0: mania\\receptors\\left@2x",
    "KeyImage0D: mania\\receptors\\left_tap@2x",
    "KeyImage1: mania\\receptors\\down@2x",
    "KeyImage1D: mania\\receptors\\down_tap@2x",
    "KeyImage2: mania\\receptors\\up@2x",
    "KeyImage2D: mania\\receptors\\up_tap@2x",
    "KeyImage3: mania\\receptors\\right@2x",
    "KeyImage3D: mania\\receptors\\right_tap@2x",
  ])
})

test("uses one column-width wildcard for every lane", async () => {
  const template = await readFile(skinIniTemplatePath, "utf8")
  const columnWidthLine = template
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("ColumnWidth:"))

  assert.equal(
    columnWidthLine,
    `ColumnWidth: \${column_width},\${column_width},\${column_width},\${column_width}`,
  )
})

test("uses combo and score position wildcards", async () => {
  const template = await readFile(skinIniTemplatePath, "utf8")
  const positionLines = template
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(ComboPosition|ScorePosition):/.test(line))

  assert.deepEqual(positionLines, [
    `ComboPosition: \${combo_position}`,
    `ScorePosition: \${score_position}`,
  ])
})

test("references the produced shared long-note body and tail paths for every lane", async () => {
  const template = await readFile(skinIniTemplatePath, "utf8")
  const longNoteLines = template
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^NoteImage[0-3][LT]:/.test(line))

  assert.deepEqual(
    longNoteLines,
    [0, 1, 2, 3].flatMap((column) => [
      `NoteImage${column}L: mania\\lns\\body`,
      `NoteImage${column}T: mania\\lns\\tail`,
    ]),
  )
})

test("renders only the copied output file", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "vsrg-template-"))
  const sourceFile = path.join(temporaryDirectory, "source-skin.ini")
  const outputFile = path.join(temporaryDirectory, "output-skin.ini")
  const template = `Name: \${skin_name}\nHitPosition: \${hit_position}\nFuture: \${future}`

  try {
    await writeFile(sourceFile, template, "utf-8")
    await copyFile(sourceFile, outputFile)

    await renderTemplateFile(outputFile, {
      skin_name: "My Skin",
      hit_position: 432,
    })

    assert.equal(await readFile(sourceFile, "utf-8"), template)
    assert.equal(
      await readFile(outputFile, "utf-8"),
      `Name: My Skin\nHitPosition: 432\nFuture: \${future}`,
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})
