import { readFile } from "node:fs/promises"
import path from "node:path"
import { resolveEtternaProfilePath } from "../settings/etterna-settings-paths.ts"

export async function readEtternaCmod(gameRoot: string, profileId: string): Promise<number> {
  const profilePath = path.join(resolveEtternaProfilePath(gameRoot, profileId), "Etterna.xml")
  let source: string
  try {
    source = await readFile(profilePath, "utf8")
  } catch (cause) {
    throw new Error(`Could not read Etterna CMod from ${profilePath}`, { cause })
  }
  return extractEtternaCmod(source, profilePath)
}

export function extractEtternaCmod(source: string, profilePath: string): number {
  const modifierSections = findXmlElements(parseXml(source, profilePath), "defaultmodifiers")
  if (modifierSections.length !== 1) {
    throw new Error(`Expected exactly one <DefaultModifiers> in ${profilePath}`)
  }
  const danceMatches = findXmlElements(modifierSections, "dance")
  if (danceMatches.length !== 1) {
    throw new Error(`Expected exactly one <dance> in <DefaultModifiers> in ${profilePath}`)
  }
  const cmodCandidates = readXmlText(danceMatches[0])
    .split(",")
    .map((modifier) => modifier.trim())
    .filter((modifier) => /^C(?=[+-]?(?:\d|\.\d))/i.test(modifier))
  if (cmodCandidates.length !== 1) {
    throw new Error(`Expected exactly one CMod in ${profilePath}`)
  }
  const match = /^C(\d+)$/i.exec(cmodCandidates[0] ?? "")
  const cmod = Number(match?.[1])
  if (!Number.isSafeInteger(cmod) || cmod <= 0) {
    throw new Error(
      `Expected a positive integer CMod within the safe-integer range in ${profilePath}`,
    )
  }
  return cmod
}

interface XmlElement {
  readonly name: string
  readonly children: XmlElement[]
  text: string
}

function parseXml(source: string, profilePath: string): XmlElement[] {
  const roots: XmlElement[] = []
  const stack: XmlElement[] = []
  let position = 0

  const appendText = (text: string) => {
    const parent = stack.at(-1)
    if (parent) parent.text += text
  }

  while (position < source.length) {
    const tagStart = source.indexOf("<", position)
    if (tagStart < 0) {
      appendText(source.slice(position))
      break
    }
    appendText(source.slice(position, tagStart))
    if (source.startsWith("<!--", tagStart)) {
      const commentEnd = source.indexOf("-->", tagStart + 4)
      if (commentEnd < 0) throw invalidXml(profilePath)
      position = commentEnd + 3
      continue
    }
    if (source.startsWith("<![CDATA[", tagStart)) {
      const cdataEnd = source.indexOf("]]>", tagStart + 9)
      if (cdataEnd < 0) throw invalidXml(profilePath)
      appendText(source.slice(tagStart + 9, cdataEnd))
      position = cdataEnd + 3
      continue
    }
    if (source.startsWith("<?", tagStart)) {
      const instructionEnd = source.indexOf("?>", tagStart + 2)
      if (instructionEnd < 0) throw invalidXml(profilePath)
      position = instructionEnd + 2
      continue
    }

    const tagEnd = findTagEnd(source, tagStart, profilePath)
    const tag = source.slice(tagStart, tagEnd + 1)
    position = tagEnd + 1
    if (tag.startsWith("<!")) continue

    const closing = /^<\/\s*([A-Za-z_][\w:.-]*)\s*>$/.exec(tag)
    if (closing?.[1]) {
      const parent = stack.at(-1)
      if (!parent || parent.name !== closing[1].toLowerCase()) throw invalidXml(profilePath)
      stack.pop()
      continue
    }

    const opening = /^<\s*([A-Za-z_][\w:.-]*)\b[^>]*>$/.exec(tag)
    if (!opening?.[1]) throw invalidXml(profilePath)
    const element: XmlElement = { name: opening[1].toLowerCase(), children: [], text: "" }
    const parent = stack.at(-1)
    if (parent) parent.children.push(element)
    else roots.push(element)
    if (!/\/\s*>$/.test(tag)) stack.push(element)
  }

  if (stack.length > 0) throw invalidXml(profilePath)
  return roots
}

function findTagEnd(source: string, start: number, profilePath: string): number {
  let quote: '"' | "'" | undefined
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === quote) quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === ">") return index
  }
  throw invalidXml(profilePath)
}

function findXmlElements(elements: readonly XmlElement[], name: string): XmlElement[] {
  return elements.flatMap((element) => [
    ...(element.name === name ? [element] : []),
    ...findXmlElements(element.children, name),
  ])
}

function readXmlText(element: XmlElement | undefined): string {
  if (!element) return ""
  return `${element.text}${element.children.map(readXmlText).join("")}`
}

function invalidXml(profilePath: string): Error {
  return new Error(`Invalid Etterna XML in ${profilePath}`)
}
