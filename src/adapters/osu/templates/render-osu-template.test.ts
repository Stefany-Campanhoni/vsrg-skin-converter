import assert from "node:assert/strict"
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { renderTemplateFile, replaceWildcards } from "./render-osu-template.ts"

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
