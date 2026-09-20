import { readTextFile, writeFileContents } from "../../../infrastructure/filesystem/bun-file.ts"

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
    const template = await readTextFile(filePath)
    const renderedTemplate = replaceWildcards(template, replacements)

    await writeFileContents(filePath, renderedTemplate)
  } catch (error) {
    throw new Error(`Failed to render template file "${filePath}".`, {
      cause: error,
    })
  }
}
