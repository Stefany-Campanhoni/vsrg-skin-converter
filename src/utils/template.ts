import { readFileSync, writeFileSync } from "node:fs"

export type TemplateReplacements = Readonly<Record<string, string | number>>

const wildcardPattern = /\$\{([a-zA-Z0-9_]+)\}/g

export function replaceWildcards(content: string, replacements: TemplateReplacements): string {
  return content.replace(wildcardPattern, (wildcard, key: string) => {
    const value = replacements[key]

    return value === undefined ? wildcard : String(value)
  })
}

export function renderTemplateFile(filePath: string, replacements: TemplateReplacements): void {
  try {
    const template = readFileSync(filePath, "utf-8")
    const renderedTemplate = replaceWildcards(template, replacements)

    writeFileSync(filePath, renderedTemplate, "utf-8")
  } catch (error) {
    throw new Error(`Failed to render template file "${filePath}".`, {
      cause: error,
    })
  }
}
