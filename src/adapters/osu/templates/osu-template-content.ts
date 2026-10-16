export type TemplateReplacements = Readonly<Record<string, string | number>>

const wildcardPattern = /\$\{([a-zA-Z0-9_]+)\}/g

export function replaceWildcards(content: string, replacements: TemplateReplacements): string {
  return content.replace(wildcardPattern, (wildcard, key: string) => {
    const value = replacements[key]

    return value === undefined ? wildcard : String(value)
  })
}
