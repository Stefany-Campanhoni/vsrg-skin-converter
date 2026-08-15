import { type JudgementGrade, judgementGrades } from "../../../domain/judgement.ts"
import { osuJudgementDefinitions } from "../judgements/osu-judgement-definitions.ts"

export interface OsuIniSection {
  readonly name: string
  readonly properties: ReadonlyMap<string, string>
}

export interface OsuMania4kDefinition {
  readonly hitPosition: number
  readonly comboPosition: number
  readonly judgementPosition: number
  readonly columnWidths: readonly number[]
  readonly normalReceptors: readonly [string, string, string, string]
  readonly pressedReceptors: readonly [string, string, string, string]
  readonly tapNotes: readonly [string, string, string, string]
  readonly judgements: Readonly<Record<JudgementGrade, string | undefined>>
}

export function parseOsuSkinIni(source: string, filePath: string): readonly OsuIniSection[] {
  const sections: OsuIniSection[] = []
  let current: { name: string; properties: Map<string, string> } | undefined

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith(";")) {
      continue
    }
    const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed)
    if (sectionMatch?.[1]) {
      current = { name: sectionMatch[1].trim(), properties: new Map<string, string>() }
      sections.push(current)
      continue
    }
    const separator = line.indexOf(":")
    if (separator < 0) {
      continue
    }
    if (!current) {
      throw new Error(`Assignment outside a section in osu! skin ${filePath}`)
    }
    const name = line.slice(0, separator).trim().toLowerCase()
    if (name) {
      current.properties.set(name, line.slice(separator + 1).trim())
    }
  }

  return sections
}

export function readOsuSkinName(sections: readonly OsuIniSection[], filePath: string): string {
  const generalSections = sections.filter((section) => section.name.toLowerCase() === "general")
  if (generalSections.length !== 1) {
    throw new Error(`Expected exactly one General section in osu! skin ${filePath}`)
  }
  const name = generalSections[0]?.properties.get("name")
  if (!name) {
    throw new Error(`Missing General Name in osu! skin ${filePath}`)
  }
  return name
}

export function readOsuComboPrefix(sections: readonly OsuIniSection[], filePath: string): string {
  const fontSections = sections.filter((section) => section.name.toLowerCase() === "fonts")
  if (fontSections.length > 1) {
    throw new Error(`Expected at most one Fonts section in osu! skin ${filePath}`)
  }
  return fontSections[0]?.properties.get("comboprefix") || "score"
}

export function readOsuMania4kDefinition(
  sections: readonly OsuIniSection[],
  filePath: string,
): OsuMania4kDefinition {
  const matches = sections.filter(
    (section) => section.name.toLowerCase() === "mania" && section.properties.get("keys") === "4",
  )
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one 4K Mania section in osu! skin ${filePath}`)
  }
  const properties = matches[0]?.properties
  if (!properties) {
    throw new Error(`Expected exactly one 4K Mania section in osu! skin ${filePath}`)
  }

  return {
    hitPosition: readNumber(properties, "hitposition", filePath),
    comboPosition: readNumber(properties, "comboposition", filePath),
    judgementPosition: readNumber(properties, "scoreposition", filePath),
    columnWidths: readColumnWidths(properties, filePath),
    normalReceptors: readTuple(properties, "keyimage", filePath),
    pressedReceptors: readTuple(properties, "keyimage", filePath, "d"),
    tapNotes: readTuple(properties, "noteimage", filePath),
    judgements: Object.fromEntries(
      judgementGrades.map((grade) => [
        grade,
        properties.get(osuJudgementDefinitions[grade].property),
      ]),
    ) as Record<JudgementGrade, string | undefined>,
  }
}

function readNumber(
  properties: ReadonlyMap<string, string>,
  property: string,
  filePath: string,
): number {
  const value = Number(requiredProperty(properties, property, filePath))
  if (!Number.isFinite(value)) {
    throw invalidProperty(property, filePath)
  }
  return value
}

function readColumnWidths(
  properties: ReadonlyMap<string, string>,
  filePath: string,
): readonly number[] {
  const widths = requiredProperty(properties, "columnwidth", filePath)
    .split(",")
    .map((part) => Number(part.trim()))
  if (
    (widths.length !== 1 && widths.length !== 4) ||
    widths.some((width) => !Number.isFinite(width) || width <= 0)
  ) {
    throw invalidProperty("ColumnWidth", filePath)
  }
  return widths.length === 1
    ? [widths[0] as number, widths[0] as number, widths[0] as number, widths[0] as number]
    : widths
}

function readTuple(
  properties: ReadonlyMap<string, string>,
  prefix: "keyimage" | "noteimage",
  filePath: string,
  suffix = "",
): [string, string, string, string] {
  return [
    requiredProperty(properties, `${prefix}0${suffix}`, filePath),
    requiredProperty(properties, `${prefix}1${suffix}`, filePath),
    requiredProperty(properties, `${prefix}2${suffix}`, filePath),
    requiredProperty(properties, `${prefix}3${suffix}`, filePath),
  ]
}

function requiredProperty(
  properties: ReadonlyMap<string, string>,
  property: string,
  filePath: string,
): string {
  const value = properties.get(property)
  if (!value) {
    throw new Error(`Missing ${property} in osu! skin ${filePath}`)
  }
  return value
}

function invalidProperty(property: string, filePath: string): Error {
  return new Error(`Invalid ${property} in osu! skin ${filePath}`)
}
