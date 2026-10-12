const wildcardPattern = /\$\{([^}]*)\}/g
export function renderOwnedTemplate(
  fileName: string,
  template: string,
  replacements: Readonly<Record<string, string | number>>,
): string {
  const wildcards = [...template.matchAll(wildcardPattern)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  )
  for (const key of Object.keys(replacements)) {
    const count = wildcards.filter((wildcard) => wildcard === key).length
    if (count !== 1) {
      throw new Error(`Expected exactly one \${${key}} wildcard in ${fileName}; found ${count}`)
    }
  }
  for (const wildcard of wildcards) {
    if (!Object.hasOwn(replacements, wildcard)) {
      throw new Error(`Unresolved wildcard \${${wildcard}} in ${fileName}`)
    }
  }

  return template.replace(wildcardPattern, (wildcard, key: string) => {
    if (!Object.hasOwn(replacements, key)) {
      throw new Error(`Unresolved wildcard ${wildcard} in ${fileName}`)
    }
    return String(replacements[key])
  })
}
