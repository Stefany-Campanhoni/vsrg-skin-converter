import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const allowedDependencies: Readonly<Record<string, ReadonlySet<string>>> = {
  root: new Set(["cli"]),
  cli: new Set([
    "adapters",
    "application",
    "cli",
    "config",
    "conversions",
    "domain",
    "infrastructure",
  ]),
  application: new Set(["application", "domain"]),
  domain: new Set(["domain"]),
  adapters: new Set(["adapters", "application", "config", "domain", "infrastructure"]),
  conversions: new Set(["application", "config", "conversions", "domain"]),
  infrastructure: new Set(["application", "domain", "infrastructure"]),
  config: new Set(["config"]),
}

export async function analyzeArchitecture(sourceRoot: string): Promise<string[]> {
  const root = path.resolve(sourceRoot)
  const files = (await collectTypeScriptFiles(root)).filter((file) => !file.endsWith(".test.ts"))
  const knownFiles = new Set(files.map(normalizePath))
  const graph = new Map<string, string[]>()
  const violations: string[] = []

  for (const file of files) {
    const normalizedFile = normalizePath(file)
    const dependencies = await readProjectDependencies(file, knownFiles)
    graph.set(normalizedFile, dependencies)
    const sourceLayer = classifyLayer(root, file)

    for (const dependency of dependencies) {
      const targetLayer = classifyLayer(root, dependency)
      if (!allowedDependencies[sourceLayer]?.has(targetLayer)) {
        violations.push(
          `Forbidden dependency: ${relative(root, file)} (${sourceLayer}) -> ${relative(root, dependency)} (${targetLayer})`,
        )
      }
    }
  }

  violations.push(...findCycles(graph).map((cycle) => `Dependency cycle: ${cycle}`))
  return violations.sort()
}

async function collectTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"),
    )
    .map((entry) => path.join(entry.parentPath, entry.name))
}

async function readProjectDependencies(
  file: string,
  knownFiles: ReadonlySet<string>,
): Promise<string[]> {
  const source = await readFile(file, "utf8")
  const dependencies = new Set<string>()
  const importPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1]
    if (!specifier) {
      continue
    }
    if (!specifier.startsWith(".")) {
      continue
    }
    const resolved = normalizePath(path.resolve(path.dirname(file), specifier))
    if (knownFiles.has(resolved)) {
      dependencies.add(resolved)
    }
  }

  return [...dependencies].sort()
}

function classifyLayer(root: string, file: string): string {
  const [first, second] = relative(root, file).split("/")
  return second ? (first ?? "root") : "root"
}

function findCycles(graph: ReadonlyMap<string, string[]>): string[] {
  const visited = new Set<string>()
  const active = new Set<string>()
  const stack: string[] = []
  const cycles = new Set<string>()

  const visit = (node: string): void => {
    if (active.has(node)) {
      const start = stack.indexOf(node)
      cycles.add([...stack.slice(start), node].map((file) => path.basename(file)).join(" -> "))
      return
    }
    if (visited.has(node)) {
      return
    }

    active.add(node)
    stack.push(node)
    for (const dependency of graph.get(node) ?? []) {
      visit(dependency)
    }
    stack.pop()
    active.delete(node)
    visited.add(node)
  }

  for (const node of graph.keys()) {
    visit(node)
  }
  return [...cycles].sort()
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase()
}

function relative(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, "/")
}
