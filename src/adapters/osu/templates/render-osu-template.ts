import { readTextFile, writeFileContents } from "../../../infrastructure/filesystem/bun-file.ts"

import { replaceWildcards, type TemplateReplacements } from "./osu-template-content.ts"

export type { TemplateReplacements } from "./osu-template-content.ts"
export { replaceWildcards } from "./osu-template-content.ts"
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
