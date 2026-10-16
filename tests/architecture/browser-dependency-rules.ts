import path from "node:path"
export function inspectBrowserModule(file: string, source: string): string[] {
  const violations: string[] = []
  for (const match of source.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g,
  )) {
    const dependency = match[1] ?? ""
    if (
      dependency.startsWith("node:") ||
      dependency === "sharp" ||
      dependency.includes("/cli/") ||
      dependency.endsWith("/cli.ts") ||
      dependency.includes("native-")
    )
      violations.push(`${file}: forbidden browser dependency ${dependency}`)
  }
  if (/\bBun\s*[.(]/.test(source)) violations.push(`${file}: Bun is unavailable in browsers`)
  return violations
}
export async function analyzeBrowserDependencies(entry: string): Promise<string[]> {
  const visited = new Set<string>(),
    violations: string[] = []
  async function visit(file: string): Promise<void> {
    file = path.resolve(file)
    if (visited.has(file)) return
    visited.add(file)
    const source = await Bun.file(file).text()
    violations.push(...inspectBrowserModule(file, source))
    for (const match of source.matchAll(
      /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g,
    ))
      if (match[1]?.startsWith(".")) await visit(path.resolve(path.dirname(file), match[1]))
  }
  await visit(entry)
  return violations.sort()
}
