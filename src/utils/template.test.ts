import assert from "node:assert/strict"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { renderTemplateFile, replaceWildcards } from "./template.ts"

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

test("renders only the copied output file", (context) => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "vsrg-template-"))
  const sourceFile = path.join(temporaryDirectory, "source-skin.ini")
  const outputFile = path.join(temporaryDirectory, "output-skin.ini")
  const template = `Name: \${skin_name}\nHitPosition: \${hit_position}\nFuture: \${future}`

  context.after(() => rmSync(temporaryDirectory, { recursive: true }))
  writeFileSync(sourceFile, template, "utf-8")
  copyFileSync(sourceFile, outputFile)

  renderTemplateFile(outputFile, {
    skin_name: "My Skin",
    hit_position: 432,
  })

  assert.equal(readFileSync(sourceFile, "utf-8"), template)
  assert.equal(
    readFileSync(outputFile, "utf-8"),
    `Name: My Skin\nHitPosition: 432\nFuture: \${future}`,
  )
})
