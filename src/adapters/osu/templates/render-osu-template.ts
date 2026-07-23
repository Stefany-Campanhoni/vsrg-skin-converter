import { readFile, writeFile } from "node:fs/promises"

export type TemplateReplacements = Readonly<Record<string, string | number>>

const wildcardPattern = /\$\{([a-zA-Z0-9_]+)\}/g

export function replaceWildcards(content: string, replacements: TemplateReplacements): string {
  return content.replace(wildcardPattern, (wildcard, key: string) => {
    const value = replacements[key]

    return value === undefined ? wildcard : String(value)
  })
}

export async function renderTemplateFile(
  filePath: string,
  replacements: TemplateReplacements,
): Promise<void> {
  try {
    const template = await readFile(filePath, "utf-8")
    const renderedTemplate = replaceWildcards(template, replacements)

    await writeFile(filePath, renderedTemplate, "utf-8")
  } catch (error) {
    throw new Error(`Failed to render template file "${filePath}".`, {
      cause: error,
    })
  }
}
