import assert from "node:assert/strict"
import test from "node:test"
import { parseOsuSkinIni, readOsuMania4kDefinition, readOsuSkinName } from "./osu-skin-ini.ts"

const filePath = "C:/osu!/Skins/Test/skin.ini"

test("preserves ordered sections and projects the unique 4K Mania definition", () => {
  const sections = parseOsuSkinIni(fixture, filePath)

  assert.deepEqual(
    sections.map((section) => section.name),
    ["General", "Mania", "Mania", "Mania"],
  )
  assert.equal(sections[0]?.properties.get("author"), "Fixture: Author")
  assert.equal(sections[2]?.properties.get("columnwidth"), "68,68,70,70")
  assert.equal(readOsuSkinName(sections, "skin.ini"), "Fixture Name")
  assert.deepEqual(readOsuMania4kDefinition(sections, "skin.ini"), {
    isDownscroll: false,
    hitPosition: 432,
    comboPosition: 210,
    judgementPosition: 244,
    columnWidths: [68, 68, 70, 70],
    normalReceptors: ["key-left", "key-down", "key-up", "key-right"],
    pressedReceptors: [
      "key-left-pressed",
      "key-down-pressed",
      "key-up-pressed",
      "key-right-pressed",
    ],
    tapNotes: ["note-left", "note-down", "note-up", "note-right"],
    judgements: {
      marvelous: "judgement-marvelous",
      perfect: "judgement-perfect",
      great: "judgement-great",
      good: "judgement-good",
      bad: "judgement-bad",
      miss: "judgement-miss",
    },
  })
})

test("expands a scalar ColumnWidth to every 4K column", () => {
  const definition = readOsuMania4kDefinition(
    parseOsuSkinIni(maniaSection("ColumnWidth: 64"), filePath),
    filePath,
  )

  assert.deepEqual(definition.columnWidths, [64, 64, 64, 64])
})

test("reads UpsideDown as osu direction and defaults an absent value to upscroll", () => {
  assert.equal(
    readOsuMania4kDefinition(parseOsuSkinIni(maniaSection("UpsideDown: 1"), "skin.ini"), "skin.ini")
      .isDownscroll,
    true,
  )
  assert.equal(
    readOsuMania4kDefinition(parseOsuSkinIni(maniaSection("UpsideDown: 0"), "skin.ini"), "skin.ini")
      .isDownscroll,
    false,
  )
  assert.equal(
    readOsuMania4kDefinition(parseOsuSkinIni(maniaSection(""), "skin.ini"), "skin.ini")
      .isDownscroll,
    false,
  )
})

test("rejects unsupported UpsideDown values with the skin path", () => {
  assert.throws(
    () =>
      readOsuMania4kDefinition(
        parseOsuSkinIni(maniaSection("UpsideDown: 2"), "skin.ini"),
        "skin.ini",
      ),
    /UpsideDown.*skin\.ini/i,
  )
})

test("rejects absent or ambiguous 4K Mania sections", () => {
  assert.throws(
    () => readOsuMania4kDefinition(parseOsuSkinIni("[Mania]\nKeys: 1", filePath), filePath),
    /skin\.ini/,
  )
  assert.throws(
    () =>
      readOsuMania4kDefinition(
        parseOsuSkinIni(`${maniaSection()}\n${maniaSection()}`, filePath),
        filePath,
      ),
    /skin\.ini/,
  )
})

test("rejects missing Mania properties and invalid numerical values", () => {
  assert.throws(
    () => readOsuMania4kDefinition(parseOsuSkinIni("[Mania]\nKeys: 4", filePath), filePath),
    /skin\.ini/,
  )
  assert.throws(
    () =>
      readOsuMania4kDefinition(
        parseOsuSkinIni(maniaSection("HitPosition: nope"), filePath),
        filePath,
      ),
    /skin\.ini/,
  )
  assert.throws(
    () =>
      readOsuMania4kDefinition(
        parseOsuSkinIni(maniaSection("ColumnWidth: 1,2"), filePath),
        filePath,
      ),
    /skin\.ini/,
  )
  assert.throws(
    () =>
      readOsuMania4kDefinition(
        parseOsuSkinIni(maniaSection("ColumnWidth: 64,0,64,64"), filePath),
        filePath,
      ),
    /skin\.ini/,
  )
})

test("allows missing 4K judgement references for osu default asset fallback", () => {
  for (const property of ["Hit300g", "Hit300", "Hit200", "Hit100", "Hit50", "Hit0"]) {
    const source = maniaSection()
      .split("\n")
      .filter((line) => !line.startsWith(`${property}:`))
      .join("\n")

    const definition = readOsuMania4kDefinition(parseOsuSkinIni(source, filePath), filePath)

    assert.equal(
      definition.judgements[propertyToGrade[property] as keyof typeof definition.judgements],
      undefined,
    )
  }
})

test("rejects missing General names with the file path", () => {
  assert.throws(
    () => readOsuSkinName(parseOsuSkinIni("[General]\nAuthor: Fixture", filePath), filePath),
    /skin\.ini/,
  )
})

test("reads a mixed-case General Name property", () => {
  const sections = parseOsuSkinIni("[gEnErAl]\nnAmE: Mixed Case Name", filePath)

  assert.equal(readOsuSkinName(sections, filePath), "Mixed Case Name")
})

test("rejects duplicate case-insensitive General sections instead of selecting one name", () => {
  const sections = parseOsuSkinIni(
    "[General]\nName: First Name\n[gEnErAl]\nName: Second Name",
    filePath,
  )

  assert.throws(
    () => readOsuSkinName(sections, filePath),
    /exactly one General section.*C:\/osu!\/Skins\/Test\/skin\.ini/i,
  )
})

test("rejects an assignment outside a section with the file path", () => {
  assert.throws(() => parseOsuSkinIni("Name: Orphan", filePath), /C:\/osu!\/Skins\/Test\/skin\.ini/)
})

function maniaSection(extraProperty = ""): string {
  return `[Mania]
Keys: 4
HitPosition: 432
ComboPosition: 210
ScorePosition: 244
ColumnWidth: 64,64,64,64
${extraProperty}
KeyImage0: key-left
KeyImage1: key-down
KeyImage2: key-up
KeyImage3: key-right
KeyImage0D: key-left-pressed
KeyImage1D: key-down-pressed
KeyImage2D: key-up-pressed
KeyImage3D: key-right-pressed
NoteImage0: note-left
NoteImage1: note-down
NoteImage2: note-up
NoteImage3: note-right
Hit300g: judgement-marvelous
Hit300: judgement-perfect
Hit200: judgement-great
Hit100: judgement-good
Hit50: judgement-bad
Hit0: judgement-miss`
}

const fixture = `[General]
Name: Fixture Name
Author: Fixture: Author

[Mania]
Keys: 1

[Mania]
Keys: 4
${maniaSection().replace("[Mania]\nKeys: 4\n", "")} 
ColumnWidth: 68,68,70,70

[Mania]
Keys: 7`

const propertyToGrade: Readonly<Record<string, string>> = {
  Hit300g: "marvelous",
  Hit300: "perfect",
  Hit200: "great",
  Hit100: "good",
  Hit50: "bad",
  Hit0: "miss",
}
