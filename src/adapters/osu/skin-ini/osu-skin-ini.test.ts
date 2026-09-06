import { expect, test } from "bun:test"
import {
  parseOsuSkinIni,
  readOsuComboPrefix,
  readOsuMania4kDefinition,
  readOsuSkinName,
} from "./osu-skin-ini.ts"

const filePath = "C:/osu!/Skins/Test/skin.ini"

test("preserves ordered sections and projects the unique 4K Mania definition", () => {
  const sections = parseOsuSkinIni(fixture, filePath)

  expect(sections.map((section) => section.name)).toStrictEqual([
    "General",
    "Mania",
    "Mania",
    "Mania",
  ])
  expect(sections[0]?.properties.get("author")).toBe("Fixture: Author")
  expect(sections[2]?.properties.get("columnwidth")).toBe("68,68,70,70")
  expect(readOsuSkinName(sections)).toBe("Fixture Name")
  expect(readOsuMania4kDefinition(sections, "skin.ini")).toStrictEqual({
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

  expect(definition.columnWidths).toStrictEqual([64, 64, 64, 64])
})

test("reads UpsideDown as osu direction and defaults an absent value to upscroll", () => {
  expect(
    readOsuMania4kDefinition(parseOsuSkinIni(maniaSection("UpsideDown: 1"), "skin.ini"), "skin.ini")
      .isDownscroll,
  ).toBe(true)
  expect(
    readOsuMania4kDefinition(parseOsuSkinIni(maniaSection("UpsideDown: 0"), "skin.ini"), "skin.ini")
      .isDownscroll,
  ).toBe(false)
  expect(
    readOsuMania4kDefinition(parseOsuSkinIni(maniaSection(""), "skin.ini"), "skin.ini")
      .isDownscroll,
  ).toBe(false)
})

test("rejects unsupported UpsideDown values with the skin path", () => {
  expect(() =>
    readOsuMania4kDefinition(
      parseOsuSkinIni(maniaSection("UpsideDown: 2"), "skin.ini"),
      "skin.ini",
    ),
  ).toThrow(/UpsideDown.*skin\.ini/i)
})

test("rejects absent or ambiguous 4K Mania sections", () => {
  expect(() =>
    readOsuMania4kDefinition(parseOsuSkinIni("[Mania]\nKeys: 1", filePath), filePath),
  ).toThrow(/skin\.ini/)
  expect(() =>
    readOsuMania4kDefinition(
      parseOsuSkinIni(`${maniaSection()}\n${maniaSection()}`, filePath),
      filePath,
    ),
  ).toThrow(/skin\.ini/)
})

test("rejects missing Mania properties and invalid numerical values", () => {
  expect(() =>
    readOsuMania4kDefinition(parseOsuSkinIni("[Mania]\nKeys: 4", filePath), filePath),
  ).toThrow(/skin\.ini/)
  expect(() =>
    readOsuMania4kDefinition(
      parseOsuSkinIni(maniaSection("HitPosition: nope"), filePath),
      filePath,
    ),
  ).toThrow(/skin\.ini/)
  expect(() =>
    readOsuMania4kDefinition(parseOsuSkinIni(maniaSection("ColumnWidth: 1,2"), filePath), filePath),
  ).toThrow(/skin\.ini/)
  expect(() =>
    readOsuMania4kDefinition(
      parseOsuSkinIni(maniaSection("ColumnWidth: 64,0,64,64"), filePath),
      filePath,
    ),
  ).toThrow(/skin\.ini/)
})

test("allows missing 4K judgement references for osu default asset fallback", () => {
  for (const property of ["Hit300g", "Hit300", "Hit200", "Hit100", "Hit50", "Hit0"]) {
    const source = maniaSection()
      .split("\n")
      .filter((line) => !line.startsWith(`${property}:`))
      .join("\n")

    const definition = readOsuMania4kDefinition(parseOsuSkinIni(source, filePath), filePath)

    expect(
      definition.judgements[propertyToGrade[property] as keyof typeof definition.judgements],
    ).toBe(undefined)
  }
})

test("uses osu default 4K notes and receptors when their references are absent", () => {
  const sourceWithoutManiaAssets = maniaSection()
    .split("\n")
    .filter((line) => !/^(?:KeyImage[0-3](?:D)?|NoteImage[0-3]):/.test(line))
    .join("\n")

  const definition = readOsuMania4kDefinition(
    parseOsuSkinIni(sourceWithoutManiaAssets, filePath),
    filePath,
  )

  expect(definition.normalReceptors).toStrictEqual([
    "mania-key1",
    "mania-key2",
    "mania-key2",
    "mania-key1",
  ])
  expect(definition.pressedReceptors).toStrictEqual([
    "mania-key1D",
    "mania-key2D",
    "mania-key2D",
    "mania-key1D",
  ])
  expect(definition.tapNotes).toStrictEqual([
    "mania-note1",
    "mania-note2",
    "mania-note2",
    "mania-note1",
  ])
})

test("uses osu default 4K assets for empty references without replacing explicit ones", () => {
  const sourceWithEmptyReferences = maniaSection()
    .replace("KeyImage0: key-left", "KeyImage0:")
    .replace("KeyImage1D: key-down-pressed", "KeyImage1D:")
    .replace("NoteImage3: note-right", "NoteImage3:")

  const definition = readOsuMania4kDefinition(
    parseOsuSkinIni(sourceWithEmptyReferences, filePath),
    filePath,
  )

  expect(definition.normalReceptors).toStrictEqual([
    "mania-key1",
    "key-down",
    "key-up",
    "key-right",
  ])
  expect(definition.pressedReceptors).toStrictEqual([
    "key-left-pressed",
    "mania-key2D",
    "key-up-pressed",
    "key-right-pressed",
  ])
  expect(definition.tapNotes).toStrictEqual(["note-left", "note-down", "note-up", "mania-note1"])
})

test("returns undefined when the General Name property is missing", () => {
  for (const source of ["[General]\nName-General: Fixture", "[General]\nName:", "[Fonts]"]) {
    expect(readOsuSkinName(parseOsuSkinIni(source, filePath))).toBe(undefined)
  }
})

test("reads a mixed-case General Name property", () => {
  const sections = parseOsuSkinIni("[gEnErAl]\nnAmE: Mixed Case Name", filePath)

  expect(readOsuSkinName(sections)).toBe("Mixed Case Name")
})

test("reads the combo font prefix and uses the osu score default when it is absent", () => {
  expect(
    readOsuComboPrefix(
      parseOsuSkinIni("[Fonts]\nComboPrefix: custom/fonts/combo", filePath),
      filePath,
    ),
  ).toBe("custom/fonts/combo")
  expect(readOsuComboPrefix(parseOsuSkinIni("[General]\nName: Fixture", filePath), filePath)).toBe(
    "score",
  )
  expect(readOsuComboPrefix(parseOsuSkinIni("[Fonts]\nComboPrefix:", filePath), filePath)).toBe(
    "score",
  )
})

test("rejects ambiguous Fonts sections instead of selecting one combo prefix", () => {
  const sections = parseOsuSkinIni(
    "[Fonts]\nComboPrefix: first\n[fOnTs]\nComboPrefix: second",
    filePath,
  )

  expect(() => readOsuComboPrefix(sections, filePath)).toThrow(/Fonts section.*skin\.ini/i)
})

test("reads the last Name from duplicate case-insensitive General sections", () => {
  const sections = parseOsuSkinIni(
    "[General]\nName: First Name\n[gEnErAl]\nName: Second Name",
    filePath,
  )

  expect(readOsuSkinName(sections)).toBe("Second Name")
})

test("rejects an assignment outside a section with the file path", () => {
  expect(() => parseOsuSkinIni("Name: Orphan", filePath)).toThrow(
    /C:\/osu!\/Skins\/Test\/skin\.ini/,
  )
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
